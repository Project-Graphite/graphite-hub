import type { Bus } from './bus.ts';
import { transaction, type Database } from './db.ts';
import type { Jobs } from './jobs.ts';
import { readProject, readProjects } from './projects.ts';

export const HEALTH_JOB = 'health';
export const HEALTH_REF = 'daily';
export const CLOSED_THROUGH = 'uptime.closed';
const DIGESTED = 'health.digest';
const OUTAGE = 'outage:';
const DAY_MS = 86_400_000;
const DOWN_AFTER = 2;

export function liveHosts(db: Database) {
  return readProjects(db).flatMap((project) =>
    project.status === 'live' && project.listed && project.deploy.kind !== 'none'
      ? [{ project: project.slug, host: project.deploy.host }]
      : [],
  );
}

export async function probe(host: string) {
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

export function percentile(values: number[], fraction: number) {
  const sorted = values.toSorted((a, b) => a - b);
  return sorted.length === 0
    ? null
    : sorted[Math.min(sorted.length - 1, Math.ceil(fraction * sorted.length) - 1)];
}

export function weightedP95(days: { minutes: number; p95Ms: number | null }[]) {
  const timed = days.filter((day) => day.p95Ms !== null);
  const minutes = timed.reduce((sum, day) => sum + day.minutes, 0);
  return minutes === 0
    ? null
    : Math.round(timed.reduce((sum, day) => sum + day.p95Ms! * day.minutes, 0) / minutes);
}

export function span(ms: number) {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) {
    return 'under a minute';
  }
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

function stateOf(db: Database, key: string) {
  return db.prepare('SELECT value FROM state WHERE key = ?').get(key)?.value as string | undefined;
}

function setState(db: Database, key: string, value: string) {
  db.prepare(
    'INSERT INTO state (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
  ).run(key, value);
}

export function dayAfter(day: string) {
  return new Date(Date.parse(day) + DAY_MS).toISOString().slice(0, 10);
}

export function closeDays(db: Database, today: string) {
  const closed = stateOf(db, CLOSED_THROUGH);
  const days = new Map<string, { project: string; day: string; ok: number[]; ms: number[] }>();
  for (const row of db
    .prepare('SELECT project, minute, ok, ms FROM uptime WHERE minute >= ? AND minute < ?')
    .all(closed ? dayAfter(closed) : '', today)) {
    const day = (row.minute as string).slice(0, 10);
    const key = `${row.project as string} ${day}`;
    const entry = days.get(key) ?? { project: row.project as string, day, ok: [], ms: [] };
    entry.ok.push(row.ok as number);
    if (row.ms !== null) {
      entry.ms.push(row.ms as number);
    }
    days.set(key, entry);
  }
  transaction(db, () => {
    const rollUp = db.prepare(
      `INSERT INTO uptime_days (project, day, minutes, up, p95_ms) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (project, day) DO UPDATE SET minutes = excluded.minutes, up = excluded.up,
         p95_ms = excluded.p95_ms`,
    );
    for (const { project, day, ok, ms } of days.values()) {
      rollUp.run(project, day, ok.length, ok.filter(Boolean).length, percentile(ms, 0.95));
    }
    setState(db, CLOSED_THROUGH, new Date(Date.parse(today) - DAY_MS).toISOString().slice(0, 10));
  });
}

export function createHealth(
  db: Database,
  bus: Bus,
  jobs: Jobs,
  deps: { check?: typeof probe; now?: () => number } = {},
) {
  const check = deps.check ?? probe;
  const now = deps.now ?? Date.now;
  const failing = new Map<string, { count: number; since: string }>();
  const upsert = db.prepare(
    `INSERT INTO uptime (project, minute, ok, ms) VALUES (?, ?, ?, ?)
     ON CONFLICT (project, minute) DO UPDATE SET ok = min(ok, excluded.ok), ms = max(coalesce(ms, 0), coalesce(excluded.ms, 0))`,
  );

  async function changed(project: string, ok: boolean, at: string) {
    const name = readProject(db, project)?.name ?? project;
    const since = stateOf(db, `${OUTAGE}${project}`);
    if (ok) {
      failing.delete(project);
      if (since) {
        db.prepare('DELETE FROM state WHERE key = ?').run(`${OUTAGE}${project}`);
        const downMs = Date.parse(at) - Date.parse(since);
        await bus.record({
          topic: 'uptime',
          key: project,
          kind: 'health',
          public: true,
          summary: `${name} was down for ${span(downMs)}`,
          detail: { project, ok: true, downMs },
          at,
        });
      }
      return;
    }
    const failure = failing.get(project) ?? { count: 0, since: at };
    failure.count += 1;
    failing.set(project, failure);
    if (failure.count >= DOWN_AFTER && !since) {
      setState(db, `${OUTAGE}${project}`, failure.since);
      await bus.record({
        topic: 'uptime',
        key: project,
        kind: 'health',
        public: true,
        summary: `${name} is down`,
        detail: { project, ok: false },
        at,
      });
    }
  }

  function arm() {
    const next = new Date(now());
    next.setUTCHours(24, 0, 0, 0);
    jobs.add(HEALTH_JOB, HEALTH_REF, next.toISOString());
  }

  return {
    arm,

    start() {
      if (!jobs.pending(HEALTH_JOB, HEALTH_REF)) {
        arm();
      }
    },

    async ping() {
      const at = new Date(now()).toISOString();
      const hosts = liveHosts(db);
      db.prepare(
        `DELETE FROM state WHERE key LIKE '${OUTAGE}%' AND substr(key, ${OUTAGE.length + 1}) NOT IN (SELECT value FROM json_each(?))`,
      ).run(JSON.stringify(hosts.map((entry) => entry.project)));
      await Promise.all(
        hosts.map(async ({ project, host }) => {
          const { ok, ms } = await check(host);
          upsert.run(project, at.slice(0, 16), ok ? 1 : 0, ms);
          await bus.publish({
            topic: 'ping',
            key: project,
            kind: 'ping',
            public: true,
            summary: `${project} ${ok ? 'up' : 'down'}`,
            detail: { project, ok, ms },
            at: new Date(now()).toISOString(),
          });
          await changed(project, ok, new Date(now()).toISOString());
        }),
      );
    },

    async digest() {
      const today = new Date(now()).toISOString().slice(0, 10);
      closeDays(db, today);
      const day = stateOf(db, CLOSED_THROUGH)!;
      if (stateOf(db, DIGESTED) === day) {
        return;
      }
      const rows = db
        .prepare(
          'SELECT minutes, up, p95_ms FROM uptime_days WHERE day = ? AND project IN (SELECT value FROM json_each(?))',
        )
        .all(day, JSON.stringify(liveHosts(db).map((entry) => entry.project)));
      if (rows.length > 0) {
        const up = rows.filter((row) => row.minutes === row.up).length;
        const p95Ms = weightedP95(
          rows.map((row) => ({
            minutes: row.minutes as number,
            p95Ms: row.p95_ms as number | null,
          })),
        );
        await bus.record({
          topic: 'uptime',
          kind: 'health',
          public: true,
          summary: `${up === rows.length ? `all ${up}` : `${up} of ${rows.length}`} up for 24 h${p95Ms === null ? '' : `, p95 ${p95Ms} ms`}`,
          detail: { up, total: rows.length, p95Ms },
          at: new Date(now()).toISOString(),
        });
      }
      setState(db, DIGESTED, day);
    },
  };
}

export type Health = ReturnType<typeof createHealth>;
