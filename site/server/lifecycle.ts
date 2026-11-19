import { rm } from 'node:fs/promises';
import path from 'node:path';
import type { Bus } from './bus.ts';
import { transaction, type Database } from './db.ts';
import type { Redis } from './redis.ts';
import { closeDays } from './uptime.ts';

const DAY_MS = 86_400_000;

function before(days: number, now: number) {
  return new Date(now - days * DAY_MS).toISOString();
}

export function applyRetention(db: Database, now = Date.now()) {
  closeDays(db, new Date(now).toISOString().slice(0, 10));
  return transaction(db, () => ({
    uptime: db.prepare('DELETE FROM uptime WHERE minute < ?').run(before(30, now).slice(0, 10))
      .changes,
    activity: db
      .prepare("DELETE FROM activity WHERE at < ? AND kind NOT IN ('deploy', 'release')")
      .run(before(180, now)).changes,
    errors: db.prepare('DELETE FROM errors WHERE last_at < ?').run(before(30, now)).changes,
    webhookDeliveries: db
      .prepare('DELETE FROM webhook_deliveries WHERE received_at < ?')
      .run(before(7, now)).changes,
    versions: db
      .prepare(
        `DELETE FROM versions WHERE at < ? AND id NOT IN (
           SELECT id FROM (SELECT id, row_number() OVER (PARTITION BY kind, key ORDER BY id DESC) AS place FROM versions)
           WHERE place <= 50)`,
      )
      .run(before(90, now)).changes,
    trashedPosts: db
      .prepare("DELETE FROM posts WHERE status = 'trashed' AND trashed_at < ?")
      .run(before(30, now)).changes,
    postVersions: db
      .prepare("DELETE FROM versions WHERE kind = 'post' AND key NOT IN (SELECT id FROM posts)")
      .run().changes,
    jobs: db.prepare('DELETE FROM jobs WHERE done_at < ?').run(before(30, now)).changes,
    subscribers: db
      .prepare(
        'DELETE FROM subscribers WHERE unsubscribed_at < ? OR (confirmed_at IS NULL AND created_at < ?)',
      )
      .run(before(30, now), before(7, now)).changes,
    sends: db.prepare('DELETE FROM sends WHERE created_at < ?').run(before(90, now)).changes,
  }));
}

export function expireUploads(db: Database, now = Date.now()) {
  const holders = [
    'SELECT avatar_upload, cover_upload, blocks FROM profiles',
    'SELECT cover_upload, feature FROM project_presentation',
    'SELECT cover_upload, html, doc FROM posts',
    'SELECT content FROM post_templates',
  ]
    .flatMap((sql) => db.prepare(sql).all())
    .flatMap((row) => Object.values(row))
    .filter((value) => value !== null)
    .map((value) =>
      typeof value === 'string' ? value : Buffer.from(value as Uint8Array).toString('latin1'),
    );
  const at = new Date(now).toISOString();
  return transaction(db, () => {
    const mark = db.prepare('UPDATE uploads SET unreferenced_at = ? WHERE id = ?');
    const remove = db.prepare('DELETE FROM uploads WHERE id = ?');
    return db
      .prepare('SELECT id, unreferenced_at FROM uploads')
      .all()
      .flatMap((row) => {
        const id = row.id as string;
        const since = row.unreferenced_at as string | null;
        if (holders.some((holder) => holder.includes(id))) {
          if (since) {
            mark.run(null, id);
          }
          return [];
        }
        if (!since) {
          mark.run(at, id);
          return [];
        }
        if (since >= before(30, now)) {
          return [];
        }
        remove.run(id);
        return [id];
      });
  });
}

export async function runLifecycle(db: Database, redis: Redis, bus: Bus, uploadsDirectory: string) {
  const uploads = expireUploads(db);
  for (const id of uploads) {
    await rm(path.join(uploadsDirectory, id), { recursive: true, force: true });
  }
  const removed = {
    ...applyRetention(db),
    uploads: uploads.length,
    streamEntries: await redis.xtrim('events', 'MINID', String(Date.now() - 7 * DAY_MS)),
  };
  await bus.record({
    topic: 'console',
    kind: 'lifecycle',
    public: false,
    summary: 'Nightly retention ran',
    detail: removed,
    at: new Date().toISOString(),
  });
}
