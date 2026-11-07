import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createPresence } from './presence.ts';
import { fakeRedis, recordingBus } from './testing.ts';

function setup() {
  let now = 1_762_500_000_000;
  const redis = fakeRedis();
  const { bus, published } = recordingBus();
  const presence = createPresence(redis, bus, () => now);
  return { presence, published, redis, advance: (ms: number) => (now += ms) };
}

const last = (published: { topic: string; detail: Record<string, unknown> }[], topic: string) =>
  published.filter((event) => event.topic === topic).at(-1)?.detail;

describe('presence', () => {
  it('counts tabs on the site and members online, publishing only on change', async () => {
    const { presence, published } = setup();
    await presence.join('t1', {});
    await presence.join('t2', { handle: 'amrmscll' });
    await presence.join('t3', { handle: 'amrmscll' });
    assert.deepEqual(last(published, 'presence'), { here: 3, online: ['amrmscll'] });
    assert.equal(published.filter((event) => event.topic === 'presence').length, 3);
    await presence.leave('t2');
    assert.deepEqual(last(published, 'presence'), { here: 2, online: ['amrmscll'] });
    await presence.leave('t3');
    assert.deepEqual(presence.current(), { here: 1, online: [] });
    await presence.touch('t1');
    assert.equal(published.filter((event) => event.topic === 'presence').length, 5);
  });

  it('counts readers per key and forgets a tab that stops touching', async () => {
    const { presence, published, advance } = setup();
    await presence.join('t1', { reading: 'post-1' });
    await presence.join('t2', { reading: 'post-1' });
    assert.deepEqual(last(published, 'reading'), { key: 'post-1', reading: 2 });
    assert.equal(presence.reading('post-1'), 2);
    advance(60_000);
    await presence.touch('t1');
    advance(45_000);
    await presence.sweep();
    assert.deepEqual(last(published, 'reading'), { key: 'post-1', reading: 1 });
    assert.deepEqual(last(published, 'presence'), { here: 1, online: [] });
  });

  it('lights a country for ten minutes after its last tab', async () => {
    const { presence, published, advance } = setup();
    await presence.join('t1', { country: 'DE' });
    await presence.join('t2', { country: 'DE' });
    await presence.join('t3', { country: 'EG' });
    assert.deepEqual(presence.countries(), [
      { code: 'DE', count: 2 },
      { code: 'EG', count: 1 },
    ]);
    assert.equal(published.filter((event) => event.topic === 'map').at(-1)?.key, 'eg');
    await presence.leave('t1');
    await presence.leave('t2');
    await presence.leave('t3');
    advance(300_000);
    await presence.sweep();
    assert.equal(presence.countries().length, 2);
    advance(301_000);
    await presence.sweep();
    assert.deepEqual(presence.countries(), []);
    assert.deepEqual(last(published, 'map'), { country: 'EG', count: 0 });
  });

  it('keeps nothing but counters in Redis', async () => {
    const { presence, redis } = setup();
    await presence.join('t1', { reading: 'post-1', handle: 'amrmscll', country: 'DE' });
    assert.deepEqual(redis.keys().sort(), [
      'map:countries',
      'presence:online',
      'presence:reading:post-1',
      'presence:tabs',
    ]);
  });
});
