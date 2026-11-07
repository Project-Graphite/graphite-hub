import type { Bus, HubEvent } from './bus.ts';
import { openDatabase } from './db.ts';
import type { Redis } from './redis.ts';

export function memoryDatabase() {
  return openDatabase(':memory:');
}

export function fakeRedis() {
  const sorted = new Map<string, Map<string, number>>();
  const sets = new Map<string, Set<string>>();
  const strings = new Map<string, string>();
  const zset = (key: string) => sorted.get(key) ?? sorted.set(key, new Map()).get(key)!;
  const bound = (value: string) =>
    value === '-inf' ? -Infinity : value === '+inf' ? Infinity : Number(value.replace('(', ''));
  const fake = {
    async zadd(key: string, score: number, member: string) {
      zset(key).set(member, score);
      return 1;
    },
    async zrem(key: string, ...members: string[]) {
      return members.filter((member) => zset(key).delete(member)).length;
    },
    async zremrangebyscore(key: string, min: string, max: string) {
      const exclusiveMax = max.startsWith('(');
      let removed = 0;
      for (const [member, score] of zset(key)) {
        if (score >= bound(min) && (exclusiveMax ? score < bound(max) : score <= bound(max))) {
          zset(key).delete(member);
          removed += 1;
        }
      }
      return removed;
    },
    async zrange(key: string) {
      return [...zset(key)].sort((a, b) => a[1] - b[1]).map(([member]) => member);
    },
    async expire() {
      return 1;
    },
    async pfadd(key: string, member: string) {
      const set = sets.get(key) ?? sets.set(key, new Set()).get(key)!;
      const fresh = !set.has(member);
      set.add(member);
      return fresh ? 1 : 0;
    },
    async set(key: string, value: string, ...flags: unknown[]) {
      if (flags.includes('NX') && strings.has(key)) {
        return null;
      }
      strings.set(key, value);
      return 'OK';
    },
    async get(key: string) {
      return strings.get(key) ?? null;
    },
    async scan(_cursor: string, _match: string, pattern: string) {
      const prefix = pattern.replace(/\*$/, '');
      return ['0', fake.keys().filter((key) => key.startsWith(prefix))];
    },
    async del(...keys: string[]) {
      return keys.filter((key) => sorted.delete(key) || sets.delete(key) || strings.delete(key))
        .length;
    },
    keys: () => [
      ...[...sorted].filter(([, members]) => members.size > 0).map(([key]) => key),
      ...sets.keys(),
      ...strings.keys(),
    ],
  };
  return fake as unknown as Redis & { keys(): string[] };
}

export function recordingBus() {
  const recorded: HubEvent[] = [];
  const published: HubEvent[] = [];
  const listeners = new Set<(delivery: { event: HubEvent }) => void>();
  const bus = {
    ready: Promise.resolve(),
    record: async (event: HubEvent) => {
      recorded.push(event);
      return `${Date.now()}-${recorded.length}`;
    },
    publish: async (event: HubEvent) => {
      published.push(event);
      for (const listener of listeners) {
        listener({ event });
      }
    },
    since: async () => [],
    listen: (listener: (delivery: { event: HubEvent }) => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  } as unknown as Bus;
  return { bus, recorded, published };
}
