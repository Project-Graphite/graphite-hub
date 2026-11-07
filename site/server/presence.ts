import type { Country, Presence as Site } from '../app/types.ts';
import type { Bus } from './bus.ts';
import type { Redis } from './redis.ts';

const WINDOW_MS = 90_000;
const MAP_MS = 600_000;
const SWEEP_MS = 30_000;

export interface Tab {
  reading?: string;
  handle?: string;
  country?: string;
}

export function createPresence(redis: Redis, bus: Bus, now = () => Date.now()) {
  const tabs = new Map<string, Tab>();
  const last = {
    site: { here: 0, online: [] as string[] } satisfies Site,
    reading: new Map<string, number>(),
    map: new Map<string, number>(),
  };
  let sweeper: ReturnType<typeof setInterval> | undefined;

  const readingKey = (key: string) => `presence:reading:${key}`;

  async function members(key: string, windowMs: number) {
    const at = now();
    await redis.zremrangebyscore(key, '-inf', `(${at - windowMs}`);
    await redis.expire(key, Math.ceil((windowMs * 2) / 1000));
    return redis.zrange(key, '0', '-1');
  }

  async function add(key: string, member: string) {
    await redis.zadd(key, String(now()), member);
  }

  async function publish(topic: string, key: string | undefined, detail: Record<string, unknown>) {
    await bus.publish({
      topic,
      key,
      kind: topic,
      public: true,
      summary: `${topic} changed`,
      detail,
      at: new Date(now()).toISOString(),
    });
  }

  async function site() {
    const here = (await members('presence:tabs', WINDOW_MS)).length;
    const online = [
      ...new Set((await members('presence:online', WINDOW_MS)).map((entry) => entry.split('|')[0])),
    ].sort();
    if (here === last.site.here && online.join(',') === last.site.online.join(',')) {
      return;
    }
    last.site = { here, online };
    await publish('presence', undefined, { here, online });
  }

  async function reading(key: string) {
    const count = (await members(readingKey(key), WINDOW_MS)).length;
    if ((last.reading.get(key) ?? 0) === count) {
      return;
    }
    if (count === 0) {
      last.reading.delete(key);
    } else {
      last.reading.set(key, count);
    }
    await publish('reading', key, { key, reading: count });
  }

  async function map() {
    const counts = new Map<string, number>();
    for (const entry of await members('map:countries', MAP_MS)) {
      const code = entry.split('|')[0];
      counts.set(code, (counts.get(code) ?? 0) + 1);
    }
    for (const code of new Set([...counts.keys(), ...last.map.keys()])) {
      const count = counts.get(code) ?? 0;
      if ((last.map.get(code) ?? 0) === count) {
        continue;
      }
      if (count === 0) {
        last.map.delete(code);
      } else {
        last.map.set(code, count);
      }
      await publish('map', code.toLowerCase(), { country: code, count });
    }
  }

  async function write(tab: string, attributes: Tab) {
    await add('presence:tabs', tab);
    if (attributes.handle) {
      await add('presence:online', `${attributes.handle}|${tab}`);
    }
    if (attributes.reading) {
      await add(readingKey(attributes.reading), tab);
    }
    if (attributes.country) {
      await add('map:countries', `${attributes.country}|${tab}`);
    }
  }

  async function sweep() {
    await site();
    for (const key of new Set([
      ...last.reading.keys(),
      ...[...tabs.values()].flatMap((tab) => tab.reading ?? []),
    ])) {
      await reading(key);
    }
    await map();
  }

  return {
    async join(tab: string, attributes: Tab) {
      tabs.set(tab, attributes);
      await write(tab, attributes);
      await site();
      if (attributes.reading) {
        await reading(attributes.reading);
      }
      if (attributes.country) {
        await map();
      }
    },

    async touch(tab: string) {
      const attributes = tabs.get(tab);
      if (attributes) {
        await write(tab, attributes);
      }
    },

    async leave(tab: string) {
      const attributes = tabs.get(tab);
      if (!attributes) {
        return;
      }
      tabs.delete(tab);
      await redis.zrem('presence:tabs', tab);
      if (attributes.handle) {
        await redis.zrem('presence:online', `${attributes.handle}|${tab}`);
      }
      if (attributes.reading) {
        await redis.zrem(readingKey(attributes.reading), tab);
      }
      await site();
      if (attributes.reading) {
        await reading(attributes.reading);
      }
    },

    sweep,

    start() {
      sweeper = setInterval(() => void sweep().catch(() => undefined), SWEEP_MS);
      return sweep();
    },

    stop() {
      clearInterval(sweeper);
    },

    current: (): Site => last.site,
    reading: (key: string) => last.reading.get(key) ?? 0,
    countries: (): Country[] =>
      [...last.map]
        .map(([code, count]) => ({ code, count }))
        .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code)),
  };
}

export type Presence = ReturnType<typeof createPresence>;
