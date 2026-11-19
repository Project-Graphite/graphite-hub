import type { Database } from './db.ts';
import { log } from './log.ts';
import type { Redis } from './redis.ts';

export interface HubEvent {
  topic: string;
  key?: string;
  kind: string;
  public: boolean;
  summary: string;
  actor?: string;
  detail: Record<string, unknown>;
  at: string;
}

export interface Delivery {
  id?: string;
  line?: number;
  event: HubEvent;
}

const STREAM = 'events';
const STREAM_DAYS = 7;

export function createBus(db: Database, redis: Redis) {
  const listeners = new Set<(delivery: Delivery) => void>();
  const insert = db.prepare(
    'INSERT INTO activity (kind, public, ref, actor, summary, detail, at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  );

  function dispatch(delivery: Delivery) {
    for (const listener of listeners) {
      listener(delivery);
    }
  }

  return {
    alive: () =>
      redis.ping().then(
        () => true,
        () => false,
      ),
    async record(event: HubEvent) {
      const line = Number(
        insert.run(
          event.kind,
          event.public ? 1 : 0,
          event.key ?? null,
          event.actor ?? null,
          event.summary,
          JSON.stringify(event.detail),
          event.at,
        ).lastInsertRowid,
      );
      const id = await redis
        .xadd(
          STREAM,
          'MINID',
          '~',
          String(Date.now() - STREAM_DAYS * 86_400_000),
          '*',
          'event',
          JSON.stringify(event),
          'line',
          String(line),
        )
        .catch((error: unknown) => {
          log.warn({ err: error }, 'event kept out of the replay stream');
          return null;
        });
      dispatch({ id: id ?? undefined, line, event });
    },
    async publish(event: HubEvent) {
      dispatch({ event });
    },
    async since(id: string): Promise<Delivery[]> {
      const entries = await redis.xrange(STREAM, `(${id}`, '+').catch((error: unknown) => {
        log.warn({ err: error }, 'replay stream not read');
        return [];
      });
      return entries.map(([entryId, fields]) => ({
        id: entryId,
        line: fields[3] === undefined ? undefined : Number(fields[3]),
        event: JSON.parse(fields[1]) as HubEvent,
      }));
    },
    listen(listener: (delivery: Delivery) => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export type Bus = ReturnType<typeof createBus>;
