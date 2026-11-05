import type { ConsoleLine, Counts, Day, Directory, Running } from '../app/types.ts';
import { toPublicEvent } from './console/public.ts';
import { json, type Database } from './db.ts';

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
