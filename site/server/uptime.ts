import type { Bus } from './bus.ts';
import type { Database } from './db.ts';
import { storedEntries } from './registry.ts';

export function liveHosts(db: Database) {
  return storedEntries(db).flatMap((entry) =>
    entry.status === 'live' && entry.listed !== false && entry.deploy.kind !== 'none'
      ? [{ project: entry.slug, host: entry.deploy.host }]
      : [],
  );
}

async function probe(host: string) {
  const started = performance.now();
  try {
    const response = await fetch(`https://${host}/`, {
      redirect: 'manual',
      signal: AbortSignal.timeout(10_000),
      headers: { 'User-Agent': 'project-graphite-hub-uptime' },
    });
    await response.body?.cancel();
    return { ok: response.status < 500, ms: Math.round(performance.now() - started) };
  } catch {
    return { ok: false, ms: null };
  }
}

export async function pingAll(db: Database, bus: Bus) {
  const minute = new Date().toISOString().slice(0, 16);
  const upsert = db.prepare(
    `INSERT INTO uptime (project, minute, ok, ms) VALUES (?, ?, ?, ?)
     ON CONFLICT (project, minute) DO UPDATE SET ok = min(ok, excluded.ok), ms = max(coalesce(ms, 0), coalesce(excluded.ms, 0))`,
  );
  await Promise.all(
    liveHosts(db).map(async ({ project, host }) => {
      const { ok, ms } = await probe(host);
      upsert.run(project, minute, ok ? 1 : 0, ms);
      await bus.publish({
        topic: 'ping',
        key: project,
        kind: 'ping',
        public: true,
        summary: `${project} ${ok ? 'up' : 'down'}`,
        detail: { project, ok, ms },
        at: new Date().toISOString(),
      });
    }),
  );
}

export function percentile(values: number[], fraction: number) {
  const sorted = values.toSorted((a, b) => a - b);
  return sorted.length === 0
    ? null
    : sorted[Math.min(sorted.length - 1, Math.ceil(fraction * sorted.length) - 1)];
}

export async function recordUptimeSummary(db: Database, bus: Bus) {
  const since = new Date(Date.now() - 3_600_000).toISOString().slice(0, 16);
  const rows = db
    .prepare(
      'SELECT project, ok, ms FROM uptime WHERE minute >= ? AND project IN (SELECT value FROM json_each(?))',
    )
    .all(since, JSON.stringify(liveHosts(db).map((entry) => entry.project)));
  if (rows.length === 0) {
    return;
  }
  const projects = new Set(rows.map((row) => row.project as string));
  const down = new Set(rows.filter((row) => row.ok === 0).map((row) => row.project as string));
  await bus.record({
    topic: 'uptime',
    kind: 'uptime',
    public: true,
    summary: `${projects.size - down.size} of ${projects.size} up over the last hour`,
    detail: {
      up: projects.size - down.size,
      total: projects.size,
      p95Ms: percentile(
        rows.flatMap((row) => (row.ms === null ? [] : [row.ms as number])),
        0.95,
      ),
    },
    at: new Date().toISOString(),
  });
}
