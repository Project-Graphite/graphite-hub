import assert from 'node:assert/strict';
import type { IncomingMessage } from 'node:http';
import { describe, it } from 'node:test';
import { clientAddress, cloudflareRanges, countryOf, fromCloudflare } from './address.ts';
import { cookies, createAuth, safeReturn, sameOrigin } from './auth.ts';
import { createVerifier, sign } from './internal.ts';
import type { Redis } from './redis.ts';
import { createSealer, createSessions, type Session, type Sessions } from './sessions.ts';

function request(headers: Record<string, string>, remoteAddress = '172.18.0.5') {
  return { headers, socket: { remoteAddress } } as unknown as IncomingMessage;
}

describe('session sealing', () => {
  const sealer = createSealer('secret-one');

  it('round-trips the GitHub token', () => {
    assert.equal(sealer.open(sealer.seal('gho_token')), 'gho_token');
  });

  it('refuses a tampered token and one sealed with another secret', () => {
    const sealed = sealer.seal('gho_token');
    const [iv, body] = sealed.split('.');
    const flipped = Buffer.from(body, 'base64url');
    flipped[0] ^= 1;
    assert.throws(() => sealer.open(`${iv}.${flipped.toString('base64url')}`));
    assert.throws(() => createSealer('secret-two').open(sealed));
  });
});

describe('a session after SESSION_SECRET changes', () => {
  it('yields no GitHub token, so the session is ended instead of failing every request', () => {
    const session: Session = {
      login: 'AmrMsCLL',
      owner: true,
      avatarUrl: 'https://avatars.githubusercontent.com/u/1',
      token: createSealer('old-secret').seal('gho_token'),
      csrf: 'csrf',
      createdAt: '2026-11-05T00:00:00.000Z',
      checkedAt: 0,
    };
    const redis = {} as Redis;
    assert.equal(createSessions(redis, 'old-secret').githubToken(session), 'gho_token');
    assert.equal(createSessions(redis, 'new-secret').githubToken(session), undefined);
  });
});

describe('the current session', () => {
  it('serves a member as a visitor while the session store is unreachable', async () => {
    const sessions = {
      read: async () => {
        throw new Error('Reached the max retries per request limit');
      },
    } as unknown as Sessions;
    const headers: string[] = [];
    const response = { appendHeader: (_name: string, value: string) => headers.push(value) };
    const { current } = createAuth(sessions, {} as Redis);
    assert.equal(
      await current(request({ cookie: 'hub_session=abc' }), response as never),
      undefined,
    );
    assert.deepEqual(headers, []);
  });
});

describe('sign-in helpers', () => {
  it('returns only to a path on this site', () => {
    assert.equal(safeReturn('/members/amrmscll'), '/members/amrmscll');
    assert.equal(safeReturn('//evil.example'), '/');
    assert.equal(safeReturn('/\\evil.example'), '/');
    assert.equal(safeReturn('https://evil.example'), '/');
    assert.equal(safeReturn(undefined), '/');
  });

  it('reads cookies and checks the origin of state-changing requests', () => {
    assert.deepEqual(cookies(request({ cookie: 'hub_session=abc%3D; other=1' })), {
      hub_session: 'abc=',
      other: '1',
    });
    assert.ok(sameOrigin(request({ origin: 'http://localhost:3000' })));
    assert.ok(!sameOrigin(request({ origin: 'https://evil.example' })));
    assert.ok(!sameOrigin(request({})));
  });
});

describe('clientAddress', () => {
  const ranges = cloudflareRanges('173.245.48.0/20\n2400:cb00::/32');

  it('trusts CF-Connecting-IP only when the peer is Cloudflare', () => {
    assert.equal(
      clientAddress(
        request({ 'x-forwarded-for': '173.245.48.10', 'cf-connecting-ip': '198.51.100.4' }),
        ranges,
      ),
      '198.51.100.4',
    );
    assert.equal(
      clientAddress(
        request({ 'x-forwarded-for': '2400:cb00::1', 'cf-connecting-ip': '198.51.100.4' }),
        ranges,
      ),
      '198.51.100.4',
    );
    assert.equal(
      clientAddress(
        request({ 'x-forwarded-for': '203.0.113.9', 'cf-connecting-ip': '198.51.100.4' }),
        ranges,
      ),
      '203.0.113.9',
    );
  });

  it('uses the socket address for direct internal calls', () => {
    assert.equal(
      clientAddress(request({ 'cf-connecting-ip': '198.51.100.4' }, '::ffff:172.18.0.9'), ranges),
      '172.18.0.9',
    );
  });

  it('reads the country only from Cloudflare, and never an unknown code', () => {
    const edge = { 'x-forwarded-for': '173.245.48.10', 'cf-ipcountry': 'de' };
    assert.ok(fromCloudflare(request(edge), ranges));
    assert.equal(countryOf(request(edge), fromCloudflare(request(edge), ranges)), 'DE');
    assert.equal(
      countryOf(request({ 'x-forwarded-for': '203.0.113.9', 'cf-ipcountry': 'DE' })),
      undefined,
    );
    assert.equal(countryOf(request({ ...edge, 'cf-ipcountry': 'XX' }), true), undefined);
    assert.equal(countryOf(request({ ...edge, 'cf-ipcountry': 'T1' }), true), undefined);
    assert.equal(countryOf(request({ 'x-forwarded-for': '173.245.48.10' }), true), undefined);
  });
});

describe('internal request verification', () => {
  const now = 1_762_300_000_000;
  const stamp = String(now / 1000);
  const body = Buffer.from('{"project":"strata"}');
  const signed = (headers: Record<string, string> = {}) =>
    request({
      'x-graphite-timestamp': stamp,
      'x-graphite-signature': sign('shared', stamp, body),
      ...headers,
    });

  it('accepts a fresh signed request once', () => {
    const verified = createVerifier('shared', () => now);
    assert.ok(verified(signed(), body));
    assert.ok(!verified(signed(), body));
  });

  it('refuses a wrong secret, an old stamp, an altered body and anything that came through the edge', () => {
    assert.ok(!createVerifier('other', () => now)(signed(), body));
    assert.ok(!createVerifier('shared', () => now + 301_000)(signed(), body));
    assert.ok(!createVerifier('shared', () => now)(signed(), Buffer.from('{}')));
    assert.ok(
      !createVerifier('shared', () => now)(signed({ 'x-forwarded-for': '173.245.48.10' }), body),
    );
    assert.ok(!createVerifier(undefined, () => now)(signed(), body));
  });
});
