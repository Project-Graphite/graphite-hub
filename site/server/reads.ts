import type {
  ConsoleLine,
  Counts,
  Day,
  Deploy,
  Directory,
  ProjectUptime,
  Running,
} from '../app/types.ts';
import { toPublicEvent } from './console/public.ts';
import { json, type Database } from './db.ts';
import { percentile } from './uptime.ts';

const DAY_MS = 86_400_000;

export function weekOf(rows: { day: string; ok: number }[], today: string): Day[] {
  const days = new Map<string, Day>();
  for (const { day, ok } of rows) {
    days.set(day, days.get(day) === 'down' || ok === 0 ? 'down' : 'up');
  }
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(Date.parse(today) - (6 - index) * DAY_MS).toISOString().slice(0, 10);
    return days.get(day) ?? 'none';
  });
}

export function createReads(db: Database) {
  return {
    consoleLines(limit: number): ConsoleLine[] {
      return db
        .prepare(
          'SELECT seq, kind, public, summary, detail, at FROM activity WHERE public = 1 AND seq IS NOT NULL ORDER BY id DESC LIMIT ?',
        )
        .all(limit * 2)
        .flatMap((row) => {
          const projected = toPublicEvent({
            topic: 'console',
            kind: row.kind as string,
            public: true,
            summary: row.summary as string,
            detail: json(row.detail),
            at: row.at as string,
          });
          return projected ? [{ id: row.seq as string, ...projected }] : [];
        })
        .slice(0, limit)
        .reverse();
    },

    running(directory: Directory, now = Date.now()): Running[] {
      const today = new Date(now).toISOString().slice(0, 10);
      const since = new Date(now - 6 * DAY_MS).toISOString().slice(0, 10);
      const uptime = db
        .prepare(
          'SELECT project, substr(minute, 1, 10) AS day, min(ok) AS ok FROM uptime WHERE minute >= ? GROUP BY project, day',
        )
        .all(since);
      const deploys = new Map(
        db
          .prepare(
            'SELECT project, tag, max(finished_at) AS at FROM deploys WHERE ok = 1 GROUP BY project',
          )
          .all()
          .map((row) => [row.project as string, { tag: row.tag as string, at: row.at as string }]),
      );
      return directory.projects
        .filter((project) => project.status === 'live' && project.url)
        .map((project) => ({
          slug: project.slug,
          name: project.name,
          path: project.path,
          deploy: deploys.get(project.slug) ?? null,
          week: weekOf(
            uptime
              .filter((row) => row.project === project.slug)
              .map((row) => ({ day: row.day as string, ok: row.ok as number })),
            today,
          ),
        }));
    },

    deploys(project: string, limit: number): Deploy[] {
      return db
        .prepare(
          'SELECT tag, finished_at, ok, health_status, started_at FROM deploys WHERE project = ? ORDER BY finished_at DESC LIMIT ?',
        )
        .all(project, limit)
        .map((row) => ({
          tag: row.tag as string,
          at: row.finished_at as string,
          ok: row.ok === 1,
          healthStatus: row.health_status as number | null,
          durationMs: Date.parse(row.finished_at as string) - Date.parse(row.started_at as string),
        }));
    },

    uptime(days: number, now = Date.now()): Record<string, ProjectUptime> {
      const since = new Date(now - (days - 1) * DAY_MS).toISOString().slice(0, 10);
      const result: Record<string, ProjectUptime> = {};
      const recent = db
        .prepare(
          'SELECT project, substr(minute, 1, 10) AS day, min(ok) AS ok FROM uptime WHERE minute >= ? GROUP BY project, day',
        )
        .all(since)
        .map((row) => ({
          project: row.project as string,
          day: row.day as string,
          ok: row.ok as number,
        }));
      const older = db
        .prepare('SELECT project, day, minutes, up FROM uptime_days WHERE day >= ?')
        .all(since)
        .map((row) => ({
          project: row.project as string,
          day: row.day as string,
          ok: row.minutes === row.up ? 1 : 0,
        }));
      const ms = db
        .prepare('SELECT project, ms FROM uptime WHERE minute >= ? AND ms IS NOT NULL')
        .all(since);
      for (const project of new Set([...recent, ...older].map((row) => row.project))) {
        const rows = [...recent, ...older].filter((row) => row.project === project);
        const today = new Date(now).toISOString().slice(0, 10);
        result[project] = {
          days: Array.from({ length: days }, (_, index) => {
            const day = new Date(Date.parse(today) - (days - 1 - index) * DAY_MS)
              .toISOString()
              .slice(0, 10);
            const found = rows.filter((row) => row.day === day);
            return found.length === 0 ? 'none' : found.some((row) => row.ok === 0) ? 'down' : 'up';
          }),
          p95Ms: percentile(
            ms.filter((row) => row.project === project).map((row) => row.ms as number),
            0.95,
          ),
        };
      }
      return result;
    },

    counts(directory: Directory, running: Running[], now = Date.now()): Counts {
      const latest = db
        .prepare(
          'SELECT project, ok FROM uptime u WHERE minute = (SELECT max(minute) FROM uptime WHERE project = u.project)',
        )
        .all();
      const up = new Set(latest.filter((row) => row.ok === 1).map((row) => row.project as string));
      return {
        members: directory.members.length,
        projects: directory.projects.length,
        live: running.filter((project) => up.has(project.slug)).length,
        releases: directory.releases.length,
        deploys: db
          .prepare('SELECT count(*) AS count FROM deploys WHERE finished_at >= ?')
          .get(new Date(now - 7 * DAY_MS).toISOString())!.count as number,
      };
    },
  };
}

export type Reads = ReturnType<typeof createReads>;
