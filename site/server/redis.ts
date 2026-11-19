import { Redis } from 'ioredis';

export type { Redis };

export function connectRedis(url: string) {
  return new Redis(url, {
    maxRetriesPerRequest: 2,
    lazyConnect: false,
    commandTimeout: 2000,
  });
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
