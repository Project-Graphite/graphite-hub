import type { Database } from './db.ts';
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
  event: HubEvent;
}

const STREAM = 'events';
const STREAM_DAYS = 7;

export function createBus(db: Database, redis: Redis, subscriber: Redis) {
  const listeners = new Set<(delivery: Delivery) => void>();
  const insert = db.prepare(
    'INSERT INTO activity (kind, public, ref, actor, summary, detail, at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  );
  const assign = db.prepare('UPDATE activity SET seq = ? WHERE id = ?');

  subscriber.on('pmessage', (_pattern: string, _channel: string, message: string) => {
    const delivery = JSON.parse(message) as Delivery;
    for (const listener of listeners) {
      listener(delivery);
    }
  });
  const ready = subscriber.psubscribe('topic:*');

  async function send(delivery: Delivery) {
    await redis.publish(`topic:${delivery.event.topic}`, JSON.stringify(delivery));
  }

  return {
    ready,
    alive: () =>
      redis.ping().then(
        () => true,
        () => false,
      ),
    async record(event: HubEvent) {
      const { lastInsertRowid } = insert.run(
        event.kind,
        event.public ? 1 : 0,
        event.key ?? null,
        event.actor ?? null,
        event.summary,
        JSON.stringify(event.detail),
        event.at,
      );
      const id = (await redis.xadd(
        STREAM,
        'MINID',
        '~',
        String(Date.now() - STREAM_DAYS * 86_400_000),
        '*',
        'event',
        JSON.stringify(event),
      )) as string;
      assign.run(id, lastInsertRowid);
      await send({ id, event });
      return id;
    },
    publish(event: HubEvent) {
      return send({ event });
    },
    async since(id: string) {
      const entries = await redis.xrange(STREAM, `(${id}`, '+');
      return entries.map(([entryId, fields]) => ({
        id: entryId,
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
