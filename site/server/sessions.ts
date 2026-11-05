import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import type { Redis } from './redis.ts';

export interface Session {
  login: string;
  owner: boolean;
  avatarUrl: string;
  token: string;
  csrf: string;
  createdAt: string;
  checkedAt: number;
}

const TTL_SECONDS = 7 * 86_400;

export function createSealer(secret: string) {
  const key = createHash('sha256').update(secret).digest();
  return {
    seal(value: string) {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      const body = Buffer.concat([cipher.update(value), cipher.final(), cipher.getAuthTag()]);
      return `${iv.toString('base64url')}.${body.toString('base64url')}`;
    },
    open(sealed: string) {
      const [iv, body] = sealed.split('.');
      const data = Buffer.from(body, 'base64url');
      const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
      decipher.setAuthTag(data.subarray(-16));
      return Buffer.concat([decipher.update(data.subarray(0, -16)), decipher.final()]).toString();
    },
  };
}

export function sameSecret(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function createSessions(redis: Redis, secret: string) {
  const sealer = createSealer(secret);
  const sessionKey = (id: string) => `session:${id}`;
  const loginKey = (login: string) => `sessions:${login.toLowerCase()}`;

  return {
    async create(login: string, owner: boolean, avatarUrl: string, githubToken: string) {
      const id = randomBytes(32).toString('base64url');
      const session: Session = {
        login,
        owner,
        avatarUrl,
        token: sealer.seal(githubToken),
        csrf: randomBytes(24).toString('base64url'),
        createdAt: new Date().toISOString(),
        checkedAt: Date.now(),
      };
      await redis
        .multi()
        .set(sessionKey(id), JSON.stringify(session), 'EX', TTL_SECONDS)
        .sadd(loginKey(login), id)
        .expire(loginKey(login), TTL_SECONDS)
        .exec();
      return id;
    },
    async read(id: string | undefined) {
      if (!id) {
        return undefined;
      }
      const stored = await redis.get(sessionKey(id));
      if (!stored) {
        return undefined;
      }
      const session = JSON.parse(stored) as Session;
      await redis
        .multi()
        .expire(sessionKey(id), TTL_SECONDS)
        .expire(loginKey(session.login), TTL_SECONDS)
        .exec();
      return session;
    },
    githubToken(session: Session) {
      return sealer.open(session.token);
    },
    async update(id: string, session: Session) {
      await redis.set(sessionKey(id), JSON.stringify(session), 'KEEPTTL');
    },
    async destroy(id: string, login: string) {
      await redis.multi().del(sessionKey(id)).srem(loginKey(login), id).exec();
    },
    async revoke(login: string) {
      const ids = await redis.smembers(loginKey(login));
      await redis.del(loginKey(login), ...ids.map(sessionKey));
      return ids.length;
    },
  };
}

export type Sessions = ReturnType<typeof createSessions>;
