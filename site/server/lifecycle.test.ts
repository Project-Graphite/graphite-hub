import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { applyRetention, expireUploads, runLifecycle } from './lifecycle.ts';
import type { Redis } from './redis.ts';
import { memoryDatabase, recordingBus } from './testing.ts';

const NOW = Date.parse('2026-11-18T03:30:00.000Z');
const DAY_MS = 86_400_000;
const ago = (days: number) => new Date(NOW - days * DAY_MS).toISOString();

function upload(db: ReturnType<typeof memoryDatabase>, id: string) {
  db.prepare(
    "INSERT INTO uploads (id, owner, kind, mime, bytes, width, height, at) VALUES (?, 'amrmscll', 'cover', 'image/webp', 10, 10, 10, ?)",
  ).run(id, ago(100));
}

function post(db: ReturnType<typeof memoryDatabase>, id: string, extra: Record<string, unknown>) {
  const row = {
    id,
    author: 'amrmscll',
    slug: id,
    status: 'draft',
    created_at: ago(60),
    updated_at: ago(60),
    updated_by: 'amrmscll',
    ...extra,
  };
  db.prepare(
    `INSERT INTO posts (${Object.keys(row).join(', ')}) VALUES (${Object.keys(row)
      .map(() => '?')
      .join(', ')})`,
  ).run(...(Object.values(row) as string[]));
}

describe('applyRetention', () => {
  it('rolls uptime older than 30 days into days and removes only those minutes', () => {
    const db = memoryDatabase();
    const insert = db.prepare('INSERT INTO uptime (project, minute, ok, ms) VALUES (?, ?, ?, ?)');
    insert.run('strata', `${ago(40).slice(0, 10)}T10:00`, 1, 100);
    insert.run('strata', `${ago(40).slice(0, 10)}T10:01`, 0, null);
    insert.run('strata', `${ago(2).slice(0, 10)}T10:00`, 1, 90);
    assert.equal(applyRetention(db, NOW).uptime, 2);
    assert.equal(applyRetention(db, NOW).uptime, 0);
    assert.deepEqual(
      db
        .prepare('SELECT day, minutes, up, p95_ms FROM uptime_days ORDER BY day')
        .all()
        .map((row) => ({ ...row })),
      [
        { day: ago(40).slice(0, 10), minutes: 2, up: 1, p95_ms: 100 },
        { day: ago(2).slice(0, 10), minutes: 1, up: 1, p95_ms: 90 },
      ],
    );
    assert.equal(db.prepare('SELECT count(*) AS n FROM uptime').get()!.n, 1);
  });

  it('removes old activity except deploys and releases, which takes the hourly uptime rows with it', () => {
    const db = memoryDatabase();
    const insert = db.prepare(
      "INSERT INTO activity (kind, public, summary, detail, at) VALUES (?, 1, 's', '{}', ?)",
    );
    insert.run('uptime', ago(181));
    insert.run('deploy', ago(181));
    insert.run('release', ago(181));
    insert.run('uptime', ago(10));
    assert.equal(applyRetention(db, NOW).activity, 1);
    assert.deepEqual(
      db
        .prepare('SELECT kind FROM activity ORDER BY id')
        .all()
        .map((row) => row.kind),
      ['deploy', 'release', 'uptime'],
    );
  });

  it('removes the versions of a post once the post itself is purged', () => {
    const db = memoryDatabase();
    post(db, 'kept', {});
    post(db, 'old', { status: 'trashed', trashed_at: ago(31) });
    post(db, 'fresh', { status: 'trashed', trashed_at: ago(3) });
    const version = db.prepare(
      "INSERT INTO versions (kind, key, blob, by, at) VALUES (?, ?, '{}', 'x', ?)",
    );
    for (const key of ['kept', 'old', 'fresh', 'gone-before']) {
      version.run('post', key, ago(1));
    }
    version.run('profile', 'old', ago(1));
    const removed = applyRetention(db, NOW);
    assert.equal(removed.trashedPosts, 1);
    assert.equal(removed.postVersions, 2);
    assert.deepEqual(
      db
        .prepare('SELECT kind, key FROM versions ORDER BY id')
        .all()
        .map((row) => `${row.kind as string}:${row.key as string}`),
      ['post:kept', 'post:fresh', 'profile:old'],
    );
  });
});

describe('expireUploads', () => {
  it('removes an upload 30 days after it stopped being referenced, and not before', () => {
    const db = memoryDatabase();
    const ids = {
      avatar: '1'.repeat(24),
      gallery: '2'.repeat(24),
      screenshot: '3'.repeat(24),
      draft: '4'.repeat(24),
      published: '5'.repeat(24),
      template: '6'.repeat(24),
      orphan: '7'.repeat(24),
      dropped: '8'.repeat(24),
    };
    Object.values(ids).forEach((id) => upload(db, id));
    db.prepare("UPDATE profiles SET avatar_upload = ?, blocks = ? WHERE handle = 'amrmscll'").run(
      ids.avatar,
      JSON.stringify([
        { id: 'g', type: 'gallery', images: [{ upload: ids.gallery, caption: '' }] },
      ]),
    );
    db.prepare(
      "INSERT INTO project_presentation (slug, feature, updated_at, updated_by) VALUES ('strata', ?, 'now', 'x')",
    ).run(JSON.stringify({ note: '', screenshot: ids.screenshot, posts: [] }));
    post(db, 'draft', { doc: Buffer.from(`\u0001\u0002/uploads/${ids.draft}/1600.webp\u0003`) });
    post(db, 'published', { html: `<img src="/uploads/${ids.published}/1600.webp">` });
    db.prepare(
      "INSERT INTO post_templates (id, name, by, content, created_at) VALUES ('t', 'T', 'x', ?, 'now')",
    ).run(`{"src":"/uploads/${ids.template}/1600.webp"}`);

    assert.deepEqual(expireUploads(db, NOW), []);
    assert.deepEqual(expireUploads(db, NOW + 29 * DAY_MS), []);
    db.prepare("UPDATE profiles SET avatar_upload = NULL WHERE handle = 'amrmscll'").run();
    db.prepare('UPDATE posts SET cover_upload = ? WHERE id = ?').run(ids.dropped, 'draft');
    assert.deepEqual(expireUploads(db, NOW + 31 * DAY_MS), [ids.orphan]);
    assert.deepEqual(expireUploads(db, NOW + 62 * DAY_MS), [ids.avatar]);
    assert.deepEqual(
      db
        .prepare('SELECT id FROM uploads WHERE unreferenced_at IS NOT NULL')
        .all()
        .map((row) => row.id),
      [],
    );
    assert.equal(db.prepare('SELECT count(*) AS n FROM uploads').get()!.n, 6);
  });
});

describe('runLifecycle', () => {
  it('deletes the files of an expired upload and reports what it removed, privately', async () => {
    const db = memoryDatabase();
    const directory = mkdtempSync(path.join(tmpdir(), 'hub-lifecycle-'));
    try {
      const expired = '9'.repeat(24);
      upload(db, expired);
      db.prepare('UPDATE uploads SET unreferenced_at = ?').run(
        new Date(Date.now() - 31 * DAY_MS).toISOString(),
      );
      mkdirSync(path.join(directory, expired));
      writeFileSync(path.join(directory, expired, '1600.webp'), 'image');
      const { bus, recorded } = recordingBus();
      await runLifecycle(db, { xtrim: async () => 3 } as unknown as Redis, bus, directory);
      assert.equal(existsSync(path.join(directory, expired)), false);
      assert.equal(recorded.length, 1);
      assert.equal(recorded[0].public, false);
      assert.equal(recorded[0].detail.uploads, 1);
      assert.equal(recorded[0].detail.streamEntries, 3);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
