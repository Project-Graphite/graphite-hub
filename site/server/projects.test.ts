import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { describe, it } from 'node:test';
import { Refused } from '../app/profile.ts';
import { createProjects, readProjects } from './projects.ts';
import { applyEntries, type RegistryEntry } from './registry.ts';
import { presentedProject } from './snapshot.ts';
import { memoryDatabase, recordingBus } from './testing.ts';

const migrations = new URL('./migrations/', import.meta.url);
const UPLOAD = 'a'.repeat(24);

const entry = (slug: string, overrides: Partial<RegistryEntry> = {}): RegistryEntry => ({
  slug,
  kind: 'project',
  name: slug,
  summary: 'A project summary long enough to pass.',
  repo: `project-graphite/${slug}`,
  owner: 'amrmscll',
  authors: ['AmrMsCLL'],
  status: 'live',
  deploy: { kind: 'compose', host: `${slug}.project-graphite.com` },
  ...overrides,
});

function setup() {
  const db = memoryDatabase();
  db.prepare(
    "INSERT INTO members (handle, login, name, avatar_url, role, joined_at, synced_at) VALUES ('amrmscll', 'AmrMsCLL', 'Amr', '', 'owner', 'now', 'now'), ('nier0o', 'Nier0o', 'Nier', '', 'member', 'now', 'now')",
  ).run();
  db.prepare(
    "INSERT INTO uploads (id, owner, kind, mime, bytes, width, height, at) VALUES (?, 'amrmscll', 'cover', 'image/webp', 10, 10, 10, 'now')",
  ).run(UPLOAD);
  applyEntries(
    db,
    [entry('strata', { pinned: true }), entry('graphite-ui', { deploy: { kind: 'none' } })],
    '2026-11-18T00:00:00.000Z',
  );
  const { bus, published, recorded } = recordingBus();
  return { db, projects: createProjects(db, bus), published, recorded };
}

describe('migration 009', () => {
  it('fills the content columns so every page shows what it showed before', () => {
    const db = new DatabaseSync(':memory:');
    const files = readdirSync(migrations)
      .filter((file) => file.endsWith('.sql'))
      .sort();
    for (const file of files.filter((name) => name < '009')) {
      db.exec(readFileSync(new URL(file, migrations), 'utf8'));
    }
    const insert = db.prepare(
      "INSERT INTO projects (slug, repo, entry, synced_at) VALUES (?, ?, ?, '2026-11-18')",
    );
    for (const stored of [
      entry('strata', {
        summary: 'A personal workspace for your dashboard and notes.\n',
        tags: ['react', 'nestjs'],
        pinned: true,
      }),
      entry('console', { listed: false, status: 'wip' }),
      entry('pixelpocket', { name: 'PixelPocket', tags: ['cpp'], pinned: true }),
      entry('graphite-ui', {
        showcase: {
          problem: 'p'.repeat(20),
          approach: 'a'.repeat(20),
          outcome: 'o'.repeat(20),
          contributions: [{ github: 'AmrMsCLL', summary: 's'.repeat(20) }],
        },
      }),
    ]) {
      insert.run(stored.slug, stored.repo, JSON.stringify(stored));
    }
    db.prepare(
      "INSERT INTO project_presentation (slug, summary, updated_at, updated_by) VALUES ('console', 'The summary the site shows today.', 'now', 'x'), ('strata', NULL, 'now', 'x')",
    ).run();
    db.prepare(
      "INSERT INTO registry_pending (slug, fields, by, at) VALUES ('pixelpocket', ?, 'x', 'now')",
    ).run(JSON.stringify({ name: 'Pixel Pocket', tags: ['cpp', 'wasm'], pinned: false }));
    db.prepare(
      "INSERT INTO members (handle, login, name, avatar_url, role, joined_at, synced_at) VALUES ('amrmscll', 'AmrMsCLL', 'Amr', '', 'owner', 'now', 'now')",
    ).run();

    db.exec(
      readFileSync(
        new URL(
          files.find((name) => name.startsWith('009'))!,
          migrations,
        ),
        'utf8',
      ),
    );

    const rows = Object.fromEntries(
      db
        .prepare(
          'SELECT slug, name, summary, tags, status, listed, pin_order, showcase, owner, authors, removed_at FROM projects',
        )
        .all()
        .map((row) => [row.slug, { ...row }]),
    );
    assert.deepEqual(rows.strata, {
      slug: 'strata',
      name: 'strata',
      summary: 'A personal workspace for your dashboard and notes.',
      tags: '["react","nestjs"]',
      status: 'live',
      listed: 1,
      pin_order: 0,
      showcase: null,
      owner: 'amrmscll',
      authors: '["AmrMsCLL"]',
      removed_at: null,
    });
    assert.equal(rows.console.listed, 0);
    assert.equal(rows.console.status, 'wip');
    assert.equal(rows.console.summary, 'The summary the site shows today.');
    assert.equal(rows.console.pin_order, null);
    assert.equal(rows.pixelpocket.name, 'Pixel Pocket');
    assert.equal(rows.pixelpocket.tags, '["cpp","wasm"]');
    assert.equal(rows.pixelpocket.pin_order, null);
    assert.equal(rows.pixelpocket.status, 'live');
    assert.equal(
      JSON.parse(rows['graphite-ui'].showcase as string).contributions[0].github,
      'AmrMsCLL',
    );
    assert.deepEqual(
      { ...db.prepare("SELECT left_at FROM members WHERE handle = 'amrmscll'").get() },
      { left_at: null },
    );
    assert.equal(db.prepare('SELECT count(*) AS n FROM registry_pending').get()!.n, 1);
    assert.match(
      db
        .prepare(
          'EXPLAIN QUERY PLAN SELECT id FROM activity WHERE public = 1 AND kind = ? ORDER BY id DESC LIMIT 1',
        )
        .all('deploy')
        .map((row) => row.detail)
        .join(' '),
      /activity_console/,
    );
  });
});

describe('projects', () => {
  it('reads content from its own columns and infrastructure from the registry entry', () => {
    const { db } = setup();
    const [ui, strata] = readProjects(db);
    assert.equal(strata.pinOrder, 0);
    assert.deepEqual(strata.deploy, { kind: 'compose', host: 'strata.project-graphite.com' });
    assert.deepEqual(strata.feature, { note: '', screenshot: null, posts: [] });
    assert.equal(ui.pinOrder, null);
    assert.equal(presentedProject(strata).url, 'https://strata.project-graphite.com');
    assert.equal(presentedProject(strata).pinned, true);
    assert.equal(
      presentedProject({ ...strata, slug: 'tasktune', parent: 'windhawk-mods' }).path,
      '/windhawk-mods/tasktune',
    );
  });

  it('saves the named fields, keeps a version and tells the site', async () => {
    const { db, projects, published } = setup();
    await projects.save(
      'strata',
      {
        name: 'Strata 2',
        tags: ['react'],
        coverUpload: UPLOAD,
        accent: '#6f8fd1',
        layout: 'card',
        feature: { note: 'New board', screenshot: null, posts: [] },
        pinOrder: 2,
      },
      'AmrMsCLL',
    );
    const saved = projects.read('strata')!;
    assert.equal(saved.name, 'Strata 2');
    assert.deepEqual(saved.tags, ['react']);
    assert.equal(saved.coverUpload, UPLOAD);
    assert.equal(saved.layout, 'card');
    assert.equal(saved.feature.note, 'New board');
    assert.equal(saved.pinOrder, 2);
    assert.equal(saved.summary, 'A project summary long enough to pass.');
    assert.deepEqual(
      published.map((event) => [event.topic, event.key]),
      [['projects', 'strata']],
    );
    const [version] = db.prepare("SELECT key, blob, by FROM versions WHERE kind = 'project'").all();
    assert.equal(version.key, 'strata');
    assert.equal(version.by, 'AmrMsCLL');
    assert.equal(JSON.parse(version.blob as string).name, 'Strata 2');
  });

  it('writes nothing when nothing changed', async () => {
    const { db, projects, published } = setup();
    await projects.save('strata', { name: 'strata' }, 'AmrMsCLL');
    assert.equal(db.prepare('SELECT count(*) AS n FROM versions').get()!.n, 0);
    assert.deepEqual(published, []);
  });

  it('survives a registry sync that carries different content', async () => {
    const { db, projects } = setup();
    await projects.save('strata', { name: 'Edited here', listed: false }, 'AmrMsCLL');
    applyEntries(
      db,
      [
        entry('strata', { name: 'From the repository', pinned: false }),
        entry('graphite-ui', { deploy: { kind: 'none' } }),
      ],
      '2026-11-18T01:00:00.000Z',
    );
    const saved = projects.read('strata')!;
    assert.equal(saved.name, 'Edited here');
    assert.equal(saved.listed, false);
    assert.equal(saved.pinOrder, 0);
  });

  it('refuses what cannot be true', async () => {
    const { projects } = setup();
    const refused = (slug: string, fields: Parameters<typeof projects.save>[1]) =>
      assert.rejects(projects.save(slug, fields, 'AmrMsCLL'), Refused);
    await refused('graphite-ui', { status: 'live' });
    await refused('strata', { owner: 'nobody' });
    await refused('strata', { authors: ['AmrMsCLL', 'Stranger'] });
    await refused('strata', { coverUpload: 'b'.repeat(24) });
    await refused('strata', { feature: { note: '', screenshot: null, posts: ['draft'] } });
    await refused('missing', { name: 'Nothing' });
  });

  it('records a console line when a listed project changes status or becomes listed', async () => {
    const { projects, recorded } = setup();
    await projects.save('strata', { status: 'archived' }, 'AmrMsCLL');
    await projects.save('strata', { listed: false }, 'AmrMsCLL');
    await projects.save('strata', { status: 'wip' }, 'AmrMsCLL');
    await projects.save('strata', { listed: true }, 'AmrMsCLL');
    assert.deepEqual(
      recorded.map((event) => [event.kind, event.summary]),
      [
        ['project', 'strata is now archived'],
        ['project', 'strata was listed'],
      ],
    );
  });
});
