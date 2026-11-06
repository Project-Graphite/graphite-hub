import type { Database } from './db.ts';
import type { Jobs } from './jobs.ts';
import type { Outgoing } from './mail.ts';

export const EMAIL_JOB = 'email';
export const EMAIL_QUEUE = 'queue';
const MAX_ATTEMPTS = 5;
const HOUR_MS = 3_600_000;
const PAUSE_MS = 5 * 60_000;

export type SendKind = 'confirm' | 'manage' | 'post' | 'digest';
export type SendStatus = 'queued' | 'sent' | 'failed' | 'bounced';

export interface SendRow {
  id: number;
  subscriber: string;
  kind: SendKind;
  ref: string | null;
  dueAt: string;
  sentAt: string | null;
  status: SendStatus;
  attempts: number;
  error: string | null;
}

export type Deliver = (message: Outgoing) => Promise<string>;

export interface Failure {
  bounce: boolean;
  permanent: boolean;
  message: string;
}

export function classify(error: unknown): Failure {
  const { code, responseCode, permanent, message } = (error ?? {}) as {
    code?: unknown;
    responseCode?: unknown;
    permanent?: unknown;
    message?: unknown;
  };
  const status = typeof responseCode === 'number' ? responseCode : 0;
  const hard = status >= 500 || permanent === true;
  return {
    bounce: code === 'EENVELOPE' && status >= 500,
    permanent: hard,
    message: typeof message === 'string' ? message.slice(0, 300) : String(error).slice(0, 300),
  };
}

function fromRow(row: Record<string, unknown>): SendRow {
  return {
    id: row.id as number,
    subscriber: row.subscriber as string,
    kind: row.kind as SendKind,
    ref: row.ref as string | null,
    dueAt: row.due_at as string,
    sentAt: row.sent_at as string | null,
    status: row.status as SendStatus,
    attempts: row.attempts as number,
    error: row.error as string | null,
  };
}

export function createSends(
  db: Database,
  jobs: Jobs,
  deps: {
    deliver: Deliver;
    compose: (send: SendRow) => Promise<Outgoing | null>;
    perHour: () => number;
    bounced: (subscriber: string, reason: string, at: string) => void;
  },
) {
  const columns = 'id, subscriber, kind, ref, due_at, sent_at, status, attempts, error FROM sends';

  function arm(now = Date.now()) {
    const next = db.prepare("SELECT min(due_at) AS due FROM sends WHERE status = 'queued'").get()!
      .due as string | null;
    if (!next) {
      jobs.cancel(EMAIL_JOB, EMAIL_QUEUE);
      return;
    }
    const room = deps.perHour() - sentSince(now - HOUR_MS);
    jobs.add(
      EMAIL_JOB,
      EMAIL_QUEUE,
      room > 0 ? next : new Date(Math.max(Date.parse(next), now + PAUSE_MS)).toISOString(),
    );
  }

  function sentSince(since: number) {
    return db
      .prepare("SELECT count(*) AS count FROM sends WHERE status = 'sent' AND sent_at > ?")
      .get(new Date(since).toISOString())!.count as number;
  }

  function finish(id: number, status: SendStatus, error: string | null, at: string) {
    db.prepare('UPDATE sends SET status = ?, error = ?, sent_at = ? WHERE id = ?').run(
      status,
      error,
      status === 'sent' ? at : null,
      id,
    );
  }

  async function attempt(send: SendRow, now: number) {
    const at = new Date(now).toISOString();
    const attempts = send.attempts + 1;
    db.prepare('UPDATE sends SET attempts = ? WHERE id = ?').run(attempts, send.id);
    const message = await deps.compose(send).catch((error: unknown) => {
      throw Object.assign(new Error(classify(error).message), { permanent: true });
    });
    if (!message) {
      finish(send.id, 'failed', 'nothing to send', at);
      return 'failed';
    }
    try {
      const messageId = await deps.deliver(message);
      db.prepare(
        "UPDATE sends SET status = 'sent', sent_at = ?, error = NULL, message_id = ? WHERE id = ?",
      ).run(at, messageId, send.id);
      return 'sent';
    } catch (error) {
      const failure = classify(error);
      if (failure.bounce) {
        finish(send.id, 'bounced', failure.message, at);
        deps.bounced(send.subscriber, failure.message, at);
        return 'bounced';
      }
      if (failure.permanent || attempts >= MAX_ATTEMPTS) {
        finish(send.id, 'failed', failure.message, at);
        return 'failed';
      }
      db.prepare('UPDATE sends SET error = ?, due_at = ? WHERE id = ?').run(
        failure.message,
        new Date(now + PAUSE_MS * 2 ** (attempts - 1)).toISOString(),
        send.id,
      );
      return 'deferred';
    }
  }

  return {
    queue(subscriber: string, kind: SendKind, ref: string | null, dueAt: string) {
      const { changes } = db
        .prepare(
          'INSERT OR IGNORE INTO sends (subscriber, kind, ref, due_at, created_at) VALUES (?, ?, ?, ?, ?)',
        )
        .run(subscriber, kind, ref, dueAt, new Date().toISOString());
      return changes > 0;
    },

    arm,

    async drain(now = Date.now()) {
      const room = Math.max(0, deps.perHour() - sentSince(now - HOUR_MS));
      const due = db
        .prepare(
          `SELECT ${columns} WHERE status = 'queued' AND due_at <= ? ORDER BY due_at, id LIMIT ?`,
        )
        .all(new Date(now).toISOString(), room)
        .map(fromRow);
      const outcome = { sent: 0, failed: 0, bounced: 0, deferred: 0 };
      for (const send of due) {
        outcome[await attempt(send, now)] += 1;
      }
      if (db.prepare("SELECT 1 FROM sends WHERE status = 'queued'").get()) {
        arm(now);
      }
      return outcome;
    },

    recent(limit: number): SendRow[] {
      return db.prepare(`SELECT ${columns} ORDER BY id DESC LIMIT ?`).all(limit).map(fromRow);
    },

    counts() {
      const row = db
        .prepare(
          `SELECT sum(status = 'queued') AS queued, sum(status = 'sent' AND sent_at > ?) AS today,
                  sum(status = 'bounced') AS bounced, sum(status = 'failed') AS failed FROM sends`,
        )
        .get(new Date(Date.now() - 24 * HOUR_MS).toISOString())!;
      return {
        queued: (row.queued as number | null) ?? 0,
        today: (row.today as number | null) ?? 0,
        bounced: (row.bounced as number | null) ?? 0,
        failed: (row.failed as number | null) ?? 0,
      };
    },
  };
}

export type Sends = ReturnType<typeof createSends>;
