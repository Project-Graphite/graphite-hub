import { createHash, randomBytes } from 'node:crypto';
import type { Bus } from './bus.ts';
import type { Database } from './db.ts';
import type { Redis } from './redis.ts';

export type ViewKind = 'post' | 'project';

const KINDS = new Set<string>(['post', 'project']);
const KEY = /^[a-z0-9-]{1,80}$/;
const BOT =
  /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|preview|fetch|curl|wget|python|java\/|go-http|okhttp|monitor|scan/i;
const TWO_DAYS = 2 * 86_400;

export function isViewKind(value: string): value is ViewKind {
  return KINDS.has(value);
}

export function hashAddress(address: string) {
  return createHash('sha256').update(address).digest('base64url').slice(0, 22);
}

export function visitorId(salt: string, address: string, userAgent: string) {
  return createHash('sha256')
    .update(`${salt}\n${address}\n${userAgent}`)
    .digest('base64url')
    .slice(0, 22);
}

export function createViews(
  db: Database,
  redis: Redis,
  bus: Bus,
  deps: {
    exists: (kind: ViewKind, key: string) => boolean;
    allow: (addressHash: string) => Promise<boolean>;
    now?: () => number;
  },
) {
  const now = deps.now ?? (() => Date.now());
  const totals = new Map<string, number>(
    db
      .prepare('SELECT kind, key, sum(views) AS total FROM views GROUP BY kind, key')
      .all()
      .map((row) => [`${row.kind as string}:${row.key as string}`, row.total as number]),
  );
  const bump = db.prepare(
    `INSERT INTO views (kind, key, day, views) VALUES (?, ?, ?, 1)
     ON CONFLICT (kind, key, day) DO UPDATE SET views = views + 1`,
  );

  async function salt(day: string) {
    const key = `views:salt:${day}`;
    await redis.set(key, randomBytes(16).toString('hex'), 'EX', TWO_DAYS, 'NX');
    return (await redis.get(key)) ?? '';
  }

  return {
    totals: () => Object.fromEntries(totals),

    total: (kind: ViewKind, key: string) => totals.get(`${kind}:${key}`) ?? 0,

    async count(view: { kind: string; key: string; address: string; userAgent: string }) {
      const { kind, key } = view;
      if (!isViewKind(kind) || !KEY.test(key) || !deps.exists(kind, key)) {
        return 'unknown';
      }
      if (!view.userAgent || BOT.test(view.userAgent)) {
        return 'bot';
      }
      if (!(await deps.allow(hashAddress(view.address)))) {
        return 'limited';
      }
      const day = new Date(now()).toISOString().slice(0, 10);
      const bucket = `views:${kind}:${key}:${day}`;
      const fresh = await redis.pfadd(
        bucket,
        visitorId(await salt(day), view.address, view.userAgent),
      );
      await redis.expire(bucket, TWO_DAYS);
      if (!fresh) {
        return 'seen';
      }
      bump.run(kind, key, day);
      const total = (totals.get(`${kind}:${key}`) ?? 0) + 1;
      totals.set(`${kind}:${key}`, total);
      await bus.publish({
        topic: 'views',
        key,
        kind: 'views',
        public: true,
        summary: `${kind} ${key} viewed`,
        detail: { kind, key, total },
        at: new Date(now()).toISOString(),
      });
      return 'counted';
    },
  };
}

export type Views = ReturnType<typeof createViews>;
