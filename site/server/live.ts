import type { Request, Response } from 'express';
import type { Auth } from './auth.ts';
import type { Bus, Delivery, HubEvent } from './bus.ts';
import { toPublicEvent } from './console/public.ts';

const MAX_TOPICS = 12;
const TOPIC = /^[a-z]+(?::[a-z0-9-]+)?$/;
const HEARTBEAT_MS = 25_000;
const COALESCE_MS = 100;

export function parseTopics(value: unknown) {
  const topics = [
    ...new Set(
      String(value ?? '')
        .split(',')
        .filter(Boolean),
    ),
  ];
  return topics.length > 0 &&
    topics.length <= MAX_TOPICS &&
    topics.every((topic) => TOPIC.test(topic))
    ? topics
    : undefined;
}

export function matches(topics: string[], event: HubEvent) {
  return topics.some((topic) => topic === event.topic || topic === `${event.topic}:${event.key}`);
}

export function newer(id: string, than: string | undefined) {
  if (!than) {
    return true;
  }
  const [ms, seq] = id.split('-').map(Number);
  const [lastMs, lastSeq] = than.split('-').map(Number);
  return ms > lastMs || (ms === lastMs && seq > lastSeq);
}

export function payload(event: HubEvent, member: boolean) {
  const shared = {
    topic: event.topic,
    key: event.key,
    kind: event.kind,
    console: toPublicEvent(event),
  };
  return member ? { ...shared, event } : shared;
}

export function createClient(
  write: (chunk: string) => void,
  topics: string[],
  member: boolean,
  lastId: string | undefined,
) {
  let last = lastId;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const pending = new Map<string, Delivery>();

  function flush() {
    timer = undefined;
    for (const { id, event } of pending.values()) {
      write(`${id ? `id: ${id}\n` : ''}data: ${JSON.stringify(payload(event, member))}\n\n`);
    }
    pending.clear();
  }

  return {
    offer(delivery: Delivery) {
      const { id, event } = delivery;
      if (!matches(topics, event) || (!event.public && !member) || (id && !newer(id, last))) {
        return;
      }
      if (id) {
        last = id;
      }
      pending.set(`${event.topic}:${event.key ?? ''}:${event.kind}`, delivery);
      timer ??= setTimeout(flush, COALESCE_MS);
    },
    close() {
      clearTimeout(timer);
    },
  };
}

export function createLive(bus: Bus, auth: Auth) {
  const clients = new Set<Pick<ReturnType<typeof createClient>, 'offer'>>();
  bus.listen((delivery) => {
    for (const client of clients) {
      client.offer(delivery);
    }
  });

  async function handler(request: Request, response: Response) {
    const topics = parseTopics(request.query.topics);
    if (!topics) {
      response.status(400).type('text').send(`Ask for 1 to ${MAX_TOPICS} topics.`);
      return;
    }
    const member = Boolean(await auth.current(request, response));
    const header = String(request.headers['last-event-id'] ?? '');
    const lastId = /^\d+-\d+$/.test(header) ? header : undefined;
    response.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    response.write('retry: 3000\n\n');
    const held: Delivery[] = [];
    const holder = { offer: (delivery: Delivery) => held.push(delivery) };
    const client = createClient((chunk) => response.write(chunk), topics, member, lastId);
    const heartbeat = setInterval(() => response.write(': ping\n\n'), HEARTBEAT_MS);
    let open = true;
    request.on('close', () => {
      open = false;
      clearInterval(heartbeat);
      client.close();
      clients.delete(holder);
      clients.delete(client);
    });
    clients.add(holder);
    const replay = lastId ? await bus.since(lastId) : [];
    clients.delete(holder);
    if (open) {
      for (const delivery of [...replay, ...held]) {
        client.offer(delivery);
      }
      clients.add(client);
    }
  }

  return {
    handler,
    get connections() {
      return clients.size;
    },
  };
}

export type Live = ReturnType<typeof createLive>;
