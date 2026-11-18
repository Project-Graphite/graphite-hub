import { CONSOLE_KINDS, foldRuns } from '../app/console.ts';
import type {
  ConsoleLine,
  Counts,
  Day,
  Deploy,
  Directory,
  ProjectUptime,
  ReleaseGroup,
  Running,
} from '../app/types.ts';
import type { Model } from '../app/model.ts';
import type { Bus } from './bus.ts';
import { toPublicEvent } from './console/public.ts';
import { json, type Database } from './db.ts';
import { CLOSED_THROUGH, dayAfter, percentile, weightedP95 } from './uptime.ts';

const DAY_MS = 86_400_000;
const CHANGES = new Set(['ping', 'uptime', 'deploys', 'projects']);
const FOLD_MARGIN = 3;

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

interface DayRow {
  project: string;
  day: string;
  ok: number;
  minutes: number;
  p95Ms: number | null;
}

export function createReads(db: Database, bus?: Pick<Bus, 'listen'>) {
  const cache = new Map<string, unknown>();
  bus?.listen(({ event }) => {
    if (CHANGES.has(event.topic)) {
      cache.clear();
    }
  });

  function remember<T>(key: string, compute: () => T) {
    if (!bus) {
      return compute();
    }
    if (!cache.has(key)) {
      cache.set(key, compute());
    }
    return cache.get(key) as T;
  }

  function toLine(row: Record<string, unknown>): ConsoleLine[] {
    const projected = toPublicEvent({
      topic: 'console',
      kind: row.kind as string,
      public: true,
      summary: row.summary as string,
      detail: json(row.detail),
      at: row.at as string,
    });
    return projected ? [{ id: String(row.id), ...projected }] : [];
  }

  function newest(count: number, kinds: readonly string[]) {
    return db
      .prepare(
        `SELECT id, kind, summary, detail, at FROM activity
          WHERE public = 1 AND kind IN (SELECT value FROM json_each(?)) ORDER BY id DESC LIMIT ?`,
      )
      .all(JSON.stringify(kinds), count)
      .flatMap(toLine);
  }

  function openFrom(since: string) {
    const closed = db.prepare('SELECT value FROM state WHERE key = ?').get(CLOSED_THROUGH)
      ?.value as string | undefined;
    return closed && dayAfter(closed) > since ? dayAfter(closed) : since;
  }

  function dayRows(since: string) {
    return remember(`days:${since}`, (): DayRow[] => [
      ...db
        .prepare('SELECT project, day, minutes, up, p95_ms FROM uptime_days WHERE day >= ?')
        .all(since)
        .map((row) => ({
          project: row.project as string,
          day: row.day as string,
          ok: row.minutes === row.up ? 1 : 0,
          minutes: row.minutes as number,
          p95Ms: row.p95_ms as number | null,
        })),
      ...db
        .prepare(
          `SELECT project, substr(minute, 1, 10) AS day, min(ok) AS ok, count(*) AS minutes FROM uptime
            WHERE project IN (SELECT slug FROM projects) AND minute >= ? GROUP BY project, day`,
        )
        .all(openFrom(since))
        .map((row) => ({
          project: row.project as string,
          day: row.day as string,
          ok: row.ok as number,
          minutes: row.minutes as number,
          p95Ms: null,
        })),
    ]);
  }

  const upNow = () =>
    remember('up', () =>
      db
        .prepare(
          `SELECT slug FROM projects p WHERE removed_at IS NULL
              AND (SELECT ok FROM uptime WHERE project = p.slug ORDER BY minute DESC LIMIT 1) = 1`,
        )
        .all()
        .map((row) => row.slug as string),
    );

  return {
    upNow,

    consoleLines(limit: number, kinds: readonly string[] = CONSOLE_KINDS): ConsoleLine[] {
      return foldRuns(
        newest(
          limit * FOLD_MARGIN,
          CONSOLE_KINDS.filter((kind) => kinds.includes(kind)),
        ).reverse(),
      ).slice(-limit);
    },

    ticker(count: number): ConsoleLine[] {
      const recent = foldRuns(newest(count * FOLD_MARGIN, CONSOLE_KINDS).reverse()).reverse();
      const head = db.prepare(
        'SELECT id, kind, summary, detail, at FROM activity WHERE public = 1 AND kind = ? ORDER BY id DESC LIMIT 1',
      );
      const heads = CONSOLE_KINDS.flatMap((kind) => head.all(kind).flatMap(toLine))
        .map((line) => recent.find((folded) => folded.id === line.id) ?? line)
        .sort((a, b) => Number(b.id) - Number(a.id));
      return [...heads, ...recent.filter((line) => !heads.includes(line))].slice(0, count);
    },

    running(directory: Directory, now = Date.now()): Running[] {
      const today = new Date(now).toISOString().slice(0, 10);
      const uptime = dayRows(new Date(now - 6 * DAY_MS).toISOString().slice(0, 10));
      const deploys = remember(
        'deploys',
        () =>
          new Map(
            db
              .prepare(
                'SELECT project, tag, max(finished_at) AS at FROM deploys WHERE ok = 1 GROUP BY project',
              )
              .all()
              .map((row) => [
                row.project as string,
                { tag: row.tag as string, at: row.at as string },
              ]),
          ),
      );
      return directory.projects
        .filter((project) => project.status === 'live' && project.url)
        .map((project) => ({
          slug: project.slug,
          name: project.name,
          path: project.path,
          deploy: deploys.get(project.slug) ?? null,
          week: weekOf(
            uptime.filter((row) => row.project === project.slug),
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

    releaseGroups(ids: string[]): Record<string, ReleaseGroup[]> {
      return Object.fromEntries(
        db
          .prepare('SELECT id, groups FROM releases WHERE id IN (SELECT value FROM json_each(?))')
          .all(JSON.stringify(ids))
          .map((row) => [row.id as string, json<ReleaseGroup[]>(row.groups)]),
      );
    },

    edited() {
      const stamps = (query: string): Record<string, string> =>
        Object.fromEntries(
          db
            .prepare(query)
            .all()
            .map((row) => [row.key as string, row.at as string]),
        );
      return {
        members: stamps(
          'SELECT m.handle AS key, coalesce(p.updated_at, m.joined_at) AS at FROM members m LEFT JOIN profiles p USING (handle)',
        ),
        projects: stamps(
          'SELECT slug AS key, edited_at AS at FROM projects WHERE edited_at IS NOT NULL',
        ),
      };
    },

    uptime(days: number, now = Date.now()): Record<string, ProjectUptime> {
      const today = new Date(now).toISOString().slice(0, 10);
      const since = new Date(now - (days - 1) * DAY_MS).toISOString().slice(0, 10);
      const rows = dayRows(since);
      const open = remember(`ms:${since}`, () =>
        Map.groupBy(
          db
            .prepare(
              `SELECT project, ms FROM uptime
                WHERE project IN (SELECT slug FROM projects) AND minute >= ? AND ms IS NOT NULL`,
            )
            .all(openFrom(since)),
          (row) => row.project as string,
        ),
      );
      const result: Record<string, ProjectUptime> = {};
      for (const [project, found] of Map.groupBy(rows, (row) => row.project)) {
        const latencies = (open.get(project) ?? []).map((row) => row.ms as number);
        result[project] = {
          days: Array.from({ length: days }, (_, index) => {
            const day = new Date(Date.parse(today) - (days - 1 - index) * DAY_MS)
              .toISOString()
              .slice(0, 10);
            const states = found.filter((row) => row.day === day);
            return states.length === 0
              ? 'none'
              : states.some((row) => row.ok === 0)
                ? 'down'
                : 'up';
          }),
          p95Ms: weightedP95([
            ...found,
            { minutes: latencies.length, p95Ms: percentile(latencies, 0.95) },
          ]),
        };
      }
      return result;
    },

    counts(model: Model, running: Running[], now = Date.now()): Counts {
      const up = new Set(upNow());
      return {
        members: model.members.length,
        projects: model.rootProjects.length,
        live: running.filter((project) => up.has(project.slug)).length,
        releases: model.releases.length,
        deploys: db
          .prepare('SELECT count(*) AS count FROM deploys WHERE finished_at >= ?')
          .get(new Date(now - 7 * DAY_MS).toISOString())!.count as number,
      };
    },
  };
}

export type Reads = ReturnType<typeof createReads>;
