import { randomBytes } from 'node:crypto';
import type { Request, Response } from 'express';
import { MAX_TOPICS, PATCHED, type Topic } from '../app/topics.ts';
import { clientAddress } from './address.ts';
import type { Auth } from './auth.ts';
import type { Bus, Delivery, HubEvent } from './bus.ts';
import { toPublicEvent } from './console/public.ts';
import type { Presence } from './presence.ts';

const TOPIC = /^[a-z]+(?::[a-z0-9-]+)?$/;
const KEY = /^[a-z0-9-]{1,80}$/;
const HEARTBEAT_MS = 25_000;
const COALESCE_MS = 100;
const MAX_STREAMS = 1000;
const MAX_STREAMS_PER_ADDRESS = 20;
const MAX_BUFFERED_BYTES = 1_048_576;

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

export function parseKey(value: unknown) {
  return typeof value === 'string' && KEY.test(value) ? value : undefined;
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

export function payload(event: HubEvent, member: boolean, line?: number) {
  const projected = line === undefined ? null : toPublicEvent(event);
  const shared = {
    topic: event.topic,
    key: event.key,
    kind: event.kind,
    console: projected && { id: String(line), ...projected },
    ...(PATCHED.has(event.topic as Topic) ? { data: event.detail } : {}),
  };
  return member ? { ...shared, event } : shared;
}

const frames = new WeakMap<Delivery, { member?: string; visitor?: string }>();

export function frame(delivery: Delivery, member: boolean) {
  const { id, line, event } = delivery;
  const cached = frames.get(delivery) ?? frames.set(delivery, {}).get(delivery)!;
  return (cached[member ? 'member' : 'visitor'] ??=
    `${id ? `id: ${id}\n` : ''}data: ${JSON.stringify(payload(event, member, line))}\n\n`);
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
    clearTimeout(timer);
    timer = undefined;
    for (const delivery of pending.values()) {
      write(frame(delivery, member));
    }
    pending.clear();
  }

  function queue(delivery: Delivery) {
    const { id, event } = delivery;
    if (id) {
      last = id;
    }
    pending.set(`${event.topic}:${event.key ?? ''}:${event.kind}`, delivery);
    timer ??= setTimeout(flush, COALESCE_MS);
  }

  return {
    offer(delivery: Delivery) {
      const { id, event } = delivery;
      if (!matches(topics, event) || (!event.public && !member) || (id && !newer(id, last))) {
        return;
      }
      queue(delivery);
    },
    push: queue,
    flush,
    close() {
      clearTimeout(timer);
    },
  };
}

interface Stream {
  offer(delivery: Delivery): void;
  push(delivery: Delivery): void;
  member: boolean;
  login?: string;
  end(): void;
}

export function signedOut(stream: Pick<Stream, 'member' | 'login'>, event: HubEvent) {
  return (
    event.topic === 'sessions' &&
    stream.member &&
    (!event.key || stream.login?.toLowerCase() === event.key)
  );
}

export function createLive(
  bus: Bus,
  auth: Auth,
  presence: Presence,
  deps: {
    handleOf: (login: string) => string | undefined;
    countryOf: (request: Request) => string | undefined;
  },
) {
  const streams = new Set<Stream>();
  const open = new Map<string, number>();
  let total = 0;

  function deliver(stream: Stream, delivery: Delivery) {
    if (signedOut(stream, delivery.event)) {
      stream.push(delivery);
      stream.end();
    } else {
      stream.offer(delivery);
    }
  }

  bus.listen((delivery) => {
    for (const stream of streams) {
      deliver(stream, delivery);
    }
  });

  async function handler(request: Request, response: Response) {
    const topics = parseTopics(request.query.topics);
    if (!topics) {
      response.status(400).type('text').send(`Ask for 1 to ${MAX_TOPICS} topics.`);
      return;
    }
    const address = clientAddress(request);
    const held = open.get(address) ?? 0;
    if (total >= MAX_STREAMS || held >= MAX_STREAMS_PER_ADDRESS) {
      response
        .status(total >= MAX_STREAMS ? 503 : 429)
        .set('Retry-After', '30')
        .type('text')
        .send('Too many live streams.');
      return;
    }
    total += 1;
    open.set(address, held + 1);
    let live = true;
    request.on('close', () => {
      live = false;
      total -= 1;
      if (open.get(address) === 1) {
        open.delete(address);
      } else {
        open.set(address, open.get(address)! - 1);
      }
    });
    const signedIn = await auth.current(request, response);
    if (!live) {
      return;
    }
    const write = (chunk: string) => {
      if (!response.write(chunk) && response.writableLength > MAX_BUFFERED_BYTES) {
        response.destroy();
      }
    };
    const header = String(request.headers['last-event-id'] ?? '');
    const lastId = /^\d+-\d+$/.test(header) ? header : undefined;
    response.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    response.write('retry: 3000\n\n');
    const tab = randomBytes(6).toString('base64url');
    const waiting: Delivery[] = [];
    const client = createClient(write, topics, Boolean(signedIn), lastId);
    const stream: Stream = {
      offer: client.offer,
      push: client.push,
      member: Boolean(signedIn),
      login: signedIn?.session.login,
      end() {
        client.flush();
        response.end();
      },
    };
    const holder: Stream = { ...stream, offer: (delivery) => waiting.push(delivery) };
    const heartbeat = setInterval(() => {
      write(': ping\n\n');
      void presence.touch(tab);
    }, HEARTBEAT_MS);
    request.on('close', () => {
      clearInterval(heartbeat);
      client.close();
      streams.delete(holder);
      streams.delete(stream);
      void presence.leave(tab);
    });
    streams.add(holder);
    const replay = lastId ? await bus.since(lastId) : [];
    streams.delete(holder);
    if (live) {
      for (const delivery of [...replay, ...waiting]) {
        deliver(stream, delivery);
      }
      streams.add(stream);
      await presence.join(tab, {
        reading: parseKey(request.query.reading),
        handle: signedIn && deps.handleOf(signedIn.session.login),
        country: deps.countryOf(request),
      });
    }
  }

  return {
    handler,
    get connections() {
      return streams.size;
    },
  };
}

export type Live = ReturnType<typeof createLive>;
