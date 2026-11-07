import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fakeRedis, memoryDatabase, recordingBus } from './testing.ts';
import { createViews, hashAddress, visitorId } from './views.ts';

const CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/142.0.0.0 Safari/537.36';

function setup(allowed = () => true) {
  let now = 1_762_500_000_000;
  const db = memoryDatabase();
  const redis = fakeRedis();
  const { bus, published } = recordingBus();
  const views = createViews(db, redis, bus, {
    exists: (kind, key) => key === (kind === 'post' ? 'abc123' : 'strata'),
    allow: async () => allowed(),
    now: () => now,
  });
  const view = (overrides: Partial<Parameters<typeof views.count>[0]> = {}) =>
    views.count({
      kind: 'post',
      key: 'abc123',
      address: '203.0.113.7',
      userAgent: CHROME,
      ...overrides,
    });
  return { db, redis, views, published, view, advance: (ms: number) => (now += ms) };
}

describe('views', () => {
  it('counts a visitor once a day per item, so a thousand refreshes add one', async () => {
    const { views, view, published } = setup();
    assert.equal(await view(), 'counted');
    for (let refresh = 0; refresh < 999; refresh += 1) {
      assert.equal(await view(), 'seen');
    }
    assert.equal(views.total('post', 'abc123'), 1);
    assert.equal(published.filter((event) => event.topic === 'views').length, 1);
    assert.deepEqual(published[0].detail, { kind: 'post', key: 'abc123', total: 1 });
  });

  it('counts another visitor, another day and another item separately', async () => {
    const { views, view, advance, db } = setup();
    await view();
    assert.equal(await view({ address: '198.51.100.9' }), 'counted');
    assert.equal(await view({ userAgent: `${CHROME} Edg/142` }), 'counted');
    assert.equal(await view({ kind: 'project', key: 'strata' }), 'counted');
    advance(86_400_000);
    assert.equal(await view(), 'counted');
    assert.equal(views.total('post', 'abc123'), 4);
    assert.equal(views.total('project', 'strata'), 1);
    assert.equal(db.prepare('SELECT count(*) AS n FROM views').get()!.n, 3);
    assert.deepEqual(views.totals(), { 'post:abc123': 4, 'project:strata': 1 });
  });

  it('refuses unknown items, bots and anyone over the per-minute limit', async () => {
    const { view } = setup();
    assert.equal(await view({ key: 'missing' }), 'unknown');
    assert.equal(await view({ kind: 'page' }), 'unknown');
    assert.equal(await view({ userAgent: 'Mozilla/5.0 (compatible; Googlebot/2.1)' }), 'bot');
    assert.equal(await view({ userAgent: 'curl/8.4.0' }), 'bot');
    assert.equal(await view({ userAgent: '' }), 'bot');
    assert.equal(await setup(() => false).view(), 'limited');
  });

  it('stores hashes only: no address, agent or visitor id in Redis', async () => {
    const { view, redis } = setup();
    await view();
    const keys = redis.keys();
    assert.deepEqual(keys.sort(), ['views:post:abc123:2025-11-07', 'views:salt:2025-11-07']);
    assert.ok(!JSON.stringify(keys).includes('203.0.113.7'));
    assert.notEqual(visitorId('a', '203.0.113.7', CHROME), visitorId('b', '203.0.113.7', CHROME));
    assert.equal(hashAddress('203.0.113.7').length, 22);
  });
});
