import type { Bus } from './bus.ts';
import { transaction, type Database } from './db.ts';
import type { Redis } from './redis.ts';
import { percentile } from './uptime.ts';

const DAY_MS = 86_400_000;

function before(days: number, now: number) {
  return new Date(now - days * DAY_MS).toISOString();
}

export function applyRetention(db: Database, now = Date.now()) {
  return transaction(db, () => {
    const cutoff = before(30, now).slice(0, 10);
    const days = new Map<string, { project: string; day: string; ok: number[]; ms: number[] }>();
    for (const row of db
      .prepare('SELECT project, minute, ok, ms FROM uptime WHERE minute < ?')
      .all(cutoff)) {
      const day = (row.minute as string).slice(0, 10);
      const key = `${row.project as string} ${day}`;
      const entry = days.get(key) ?? { project: row.project as string, day, ok: [], ms: [] };
      entry.ok.push(row.ok as number);
      if (row.ms !== null) {
        entry.ms.push(row.ms as number);
      }
      days.set(key, entry);
    }
    const rollUp = db.prepare(
      `INSERT INTO uptime_days (project, day, minutes, up, p95_ms) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (project, day) DO UPDATE SET minutes = minutes + excluded.minutes, up = up + excluded.up,
         p95_ms = max(coalesce(p95_ms, 0), coalesce(excluded.p95_ms, 0))`,
    );
    for (const { project, day, ok, ms } of days.values()) {
      rollUp.run(project, day, ok.length, ok.filter(Boolean).length, percentile(ms, 0.95));
    }
    return {
      uptime: db.prepare('DELETE FROM uptime WHERE minute < ?').run(cutoff).changes,
      activity: db
        .prepare("DELETE FROM activity WHERE at < ? AND kind NOT IN ('deploy', 'release')")
        .run(before(180, now)).changes,
      errors: db.prepare('DELETE FROM errors WHERE last_at < ?').run(before(30, now)).changes,
      webhookDeliveries: db
        .prepare('DELETE FROM webhook_deliveries WHERE received_at < ?')
        .run(before(7, now)).changes,
    };
  });
}

export async function runLifecycle(db: Database, redis: Redis, bus: Bus) {
  const removed = {
    ...applyRetention(db),
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
