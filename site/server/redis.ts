import { Redis } from 'ioredis';

export type { Redis };

export function connectRedis(url: string) {
  const command = new Redis(url, { maxRetriesPerRequest: 2, lazyConnect: false });
  return { command, subscriber: command.duplicate() };
}

export async function slidingLimit(redis: Redis, key: string, max: number, windowMs: number) {
  const now = Date.now();
  const bucket = `limit:${key}`;
  const [, , [, count]] = (await redis
    .multi()
    .zremrangebyscore(bucket, 0, now - windowMs)
    .zadd(bucket, now, `${now}:${Math.random()}`)
    .zcard(bucket)
    .pexpire(bucket, windowMs)
    .exec()) as [unknown, unknown, [unknown, number]];
  return count <= max;
}
