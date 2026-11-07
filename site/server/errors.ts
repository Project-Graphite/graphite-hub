import { createHash } from 'node:crypto';
import type { Bus } from './bus.ts';
import type { Database } from './db.ts';
import { log } from './log.ts';

export interface Where {
  route?: string;
  requestId?: string;
}

const DAY_MS = 86_400_000;

export function httpStatus(error: unknown) {
  if (error instanceof Response) {
    return error.status;
  }
  if (typeof error === 'object' && error !== null) {
    const { status, statusCode } = error as { status?: unknown; statusCode?: unknown };
    return [status, statusCode].find((value) => typeof value === 'number') as number | undefined;
  }
  return undefined;
}

export function clientError(error: unknown) {
  const status = httpStatus(error);
  return status !== undefined && status >= 400 && status < 500;
}

export function describe(error: unknown) {
  if (error instanceof Error) {
    return { message: error.message, stack: error.stack ?? null };
  }
  const status = httpStatus(error);
  return { message: status === undefined ? String(error) : `HTTP ${status}`, stack: null };
}

export function fingerprint(message: string, stack: string | null) {
  const normalised = message
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<id>')
    .replace(/\b[0-9a-f]{7,}\b/gi, '<hex>')
    .replace(/\d+/g, '<n>');
  const frame =
    stack
      ?.split('\n')
      .find((line) => line.trim().startsWith('at '))
      ?.trim()
      .replace(/:\d+:\d+\)?$/, '') ?? '';
  return createHash('sha256').update(`${normalised}\n${frame}`).digest('hex').slice(0, 16);
}

export function createErrors(
  db: Database,
  bus: Bus,
  alert: (subject: string, text: string) => Promise<boolean>,
) {
  const find = db.prepare('SELECT resolved_at, alerted_at FROM errors WHERE fingerprint = ?');
  const upsert = db.prepare(
    `INSERT INTO errors (fingerprint, first_at, last_at, count, message, stack, route, request_id)
     VALUES (?, ?, ?, 1, ?, ?, ?, ?)
     ON CONFLICT (fingerprint) DO UPDATE SET last_at = excluded.last_at, count = count + 1,
       message = excluded.message, stack = excluded.stack, route = excluded.route,
       request_id = excluded.request_id, resolved_at = NULL`,
  );
  const alerted = db.prepare('UPDATE errors SET alerted_at = ? WHERE fingerprint = ?');

  async function notify(
    key: string,
    message: string,
    stack: string | null,
    where: Where,
    now: string,
  ) {
    const sent = await alert(
      `Graphite Hub error: ${message.slice(0, 120)}`,
      [
        message,
        '',
        `Route: ${where.route ?? 'none'}`,
        `Request: ${where.requestId ?? 'none'}`,
        `Fingerprint: ${key}`,
        '',
        stack ?? '',
      ].join('\n'),
    );
    if (sent) {
      alerted.run(now, key);
    }
  }

  return function capture(error: unknown, where: Where = {}) {
    if (clientError(error)) {
      return;
    }
    const { message, stack } = describe(error);
    const key = fingerprint(message, stack);
    const now = new Date().toISOString();
    log.error(
      { err: error, route: where.route, requestId: where.requestId, fingerprint: key },
      message,
    );
    const before = find.get(key);
    upsert.run(key, now, now, message, stack, where.route ?? null, where.requestId ?? null);
    const fresh = !before || before.resolved_at !== null;
    const quiet =
      !before?.alerted_at || Date.parse(before.alerted_at as string) < Date.now() - DAY_MS;
    if (fresh && quiet) {
      notify(key, message, stack, where, now).catch((failure: unknown) =>
        log.error({ err: failure, fingerprint: key }, 'owner alert failed'),
      );
    }
    bus
      .publish({
        topic: 'errors',
        kind: 'error',
        public: false,
        summary: message.slice(0, 200),
        detail: { fingerprint: key, route: where.route },
        at: now,
      })
      .catch((failure: unknown) => log.error({ err: failure }, 'error event not published'));
  };
}

export type Capture = ReturnType<typeof createErrors>;
