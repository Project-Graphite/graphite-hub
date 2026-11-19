import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createBus, type Delivery, type HubEvent } from './bus.ts';
import { createProfiles } from './profiles.ts';
import type { Redis } from './redis.ts';
import { createSettings } from './settings.ts';
import { createSnapshot } from './snapshot.ts';
import { memoryDatabase } from './testing.ts';

const event = (topic: string, isPublic = true): HubEvent => ({
  topic,
  key: 'strata',
  kind: 'deploy',
  public: isPublic,
  summary: 'strata deployed',
  detail: { project: 'strata' },
  at: '2026-11-18T00:00:00.000Z',
});

function redis(down = false) {
  const stream: [string, string[]][] = [];
  const calls: string[] = [];
  const fake = {
    async xadd(...args: string[]) {
      calls.push('xadd');
      if (down) {
        throw new Error('Connection is closed.');
      }
      const id = `${stream.length + 1}-0`;
      stream.push([id, args.slice(args.indexOf('*') + 1)]);
      return id;
    },
    async xrange(_stream: string, from: string) {
      calls.push('xrange');
      if (down) {
        throw new Error('Connection is closed.');
      }
      return stream.filter(([id]) => Number(id.split('-')[0]) > Number(from.slice(1, -2)));
    },
    async publish() {
      calls.push('publish');
      throw new Error('The bus no longer publishes through Redis.');
    },
    async ping() {
      if (down) {
        throw new Error('Connection is closed.');
      }
      return 'PONG';
    },
  };
  return { redis: fake as unknown as Redis, calls };
}

function listening(bus: ReturnType<typeof createBus>) {
  const heard: Delivery[] = [];
  bus.listen((delivery) => heard.push(delivery));
  return heard;
}

describe('bus', () => {
  it('hands a published event to listeners in process, without Redis', async () => {
    const { redis: fake, calls } = redis();
    const bus = createBus(memoryDatabase(), fake);
    const heard = listening(bus);
    await bus.publish(event('profiles'));
    assert.deepEqual(heard, [{ event: event('profiles') }]);
    assert.deepEqual(calls, []);
  });

  it('records an event as an activity row, a stream entry and a delivery carrying both ids', async () => {
    const db = memoryDatabase();
    const { redis: fake } = redis();
    const bus = createBus(db, fake);
    const heard = listening(bus);
    await bus.record(event('deploys'));
    await bus.record(event('deploys', false));
    assert.deepEqual(
      heard.map(({ id, line }) => [id, line]),
      [
        ['1-0', 1],
        ['2-0', 2],
      ],
    );
    assert.deepEqual(
      db
        .prepare('SELECT id, kind, public, ref, summary FROM activity ORDER BY id')
        .all()
        .map((row) => ({ ...row })),
      [
        { id: 1, kind: 'deploy', public: 1, ref: 'strata', summary: 'strata deployed' },
        { id: 2, kind: 'deploy', public: 0, ref: 'strata', summary: 'strata deployed' },
      ],
    );
    assert.deepEqual(await bus.since('1-0'), [
      { id: '2-0', line: 2, event: event('deploys', false) },
    ]);
  });

  it('keeps the row and still delivers when Redis is down, and replays nothing', async () => {
    const db = memoryDatabase();
    const bus = createBus(db, redis(true).redis);
    const heard = listening(bus);
    await bus.record(event('deploys'));
    assert.deepEqual(heard, [{ id: undefined, line: 1, event: event('deploys') }]);
    assert.equal(db.prepare('SELECT count(*) AS n FROM activity').get()!.n, 1);
    assert.deepEqual(await bus.since('0-0'), []);
    assert.equal(await bus.alive(), false);
  });

  it('lets a profile save succeed with Redis down, and the next read shows it', async () => {
    const db = memoryDatabase();
    db.prepare(
      "INSERT INTO members (handle, login, name, avatar_url, role, joined_at, synced_at) VALUES ('amrmscll', 'AmrMsCLL', 'Amr', '', 'owner', 'now', 'now')",
    ).run();
    const bus = createBus(db, redis(true).redis);
    const snapshot = createSnapshot(db, bus, createSettings(db, bus));
    const profiles = createProfiles(db, bus);
    assert.equal(snapshot.get().members[0].headline, 'Full-stack Software Engineer');
    await profiles.save('amrmscll', { fields: { headline: 'Saved while Redis was away' } }, 'x');
    assert.equal(snapshot.get().members[0].headline, 'Saved while Redis was away');
    assert.equal(
      db.prepare("SELECT count(*) AS n FROM activity WHERE kind = 'member'").get()!.n,
      1,
    );
  });
});
