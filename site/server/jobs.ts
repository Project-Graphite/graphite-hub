import type { Database } from './db.ts';

const MINUTE = 60_000;
const MAX_ATTEMPTS = 5;

export type JobHandlers = Record<string, (ref: string) => Promise<void>>;

export function createJobs(
  db: Database,
  handlers: JobHandlers,
  capture: (error: unknown, context: { route: string }) => void,
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running = false;
  let stopped = false;

  function arm(now = Date.now()) {
    clearTimeout(timer);
    if (stopped) {
      return;
    }
    const next = db
      .prepare('SELECT min(due_at) AS due FROM jobs WHERE done_at IS NULL AND attempts < ?')
      .get(MAX_ATTEMPTS)!.due as string | null;
    const wait = next ? Math.max(0, Date.parse(next) - now) : MINUTE;
    timer = setTimeout(tick, Math.min(wait, MINUTE)).unref();
  }

  async function runDue(now = Date.now()) {
    const due = db
      .prepare(
        'SELECT id, kind, ref FROM jobs WHERE done_at IS NULL AND attempts < ? AND due_at <= ? ORDER BY due_at, id',
      )
      .all(MAX_ATTEMPTS, new Date(now).toISOString());
    const ran: string[] = [];
    for (const job of due) {
      db.prepare('UPDATE jobs SET attempts = attempts + 1 WHERE id = ?').run(job.id as number);
      try {
        await handlers[job.kind as string]?.(job.ref as string);
        db.prepare('UPDATE jobs SET done_at = ?, last_error = NULL WHERE id = ?').run(
          new Date().toISOString(),
          job.id as number,
        );
        ran.push(`${job.kind as string}:${job.ref as string}`);
      } catch (error) {
        db.prepare('UPDATE jobs SET last_error = ? WHERE id = ?').run(
          error instanceof Error ? error.message : String(error),
          job.id as number,
        );
        capture(error, { route: `job:${job.kind as string}` });
      }
    }
    return ran;
  }

  async function tick() {
    if (running) {
      return;
    }
    running = true;
    try {
      await runDue();
    } finally {
      running = false;
      arm();
    }
  }

  return {
    add(kind: string, ref: string, dueAt: string) {
      db.prepare('DELETE FROM jobs WHERE kind = ? AND ref = ? AND done_at IS NULL').run(kind, ref);
      db.prepare('INSERT INTO jobs (kind, ref, due_at) VALUES (?, ?, ?)').run(kind, ref, dueAt);
      arm();
    },
    cancel(kind: string, ref: string) {
      db.prepare('DELETE FROM jobs WHERE kind = ? AND ref = ? AND done_at IS NULL').run(kind, ref);
      arm();
    },
    pending(kind: string, ref: string) {
      return Boolean(
        db
          .prepare('SELECT 1 FROM jobs WHERE kind = ? AND ref = ? AND done_at IS NULL')
          .get(kind, ref),
      );
    },
    runDue,
    start() {
      stopped = false;
      arm();
    },
    stop() {
      stopped = true;
      clearTimeout(timer);
    },
  };
}

export type Jobs = ReturnType<typeof createJobs>;
