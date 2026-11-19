import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { describe, it, mock } from 'node:test';
import type { Request, Response } from 'express';
import type { Auth } from './auth.ts';
import type { HubEvent } from './bus.ts';
import {
  createClient,
  createLive,
  frame,
  matches,
  newer,
  parseKey,
  parseTopics,
  payload,
  signedOut,
} from './live.ts';
import type { Presence } from './presence.ts';
import { recordingBus } from './testing.ts';

const event = (topic: string, key?: string, isPublic = true): HubEvent => ({
  topic,
  key,
  kind: 'release',
  public: isPublic,
  summary: 's',
  detail: {},
  at: '2026-11-05T00:00:00.000Z',
});

describe('parseTopics', () => {
  it('accepts up to twelve well-formed topics, deduplicated', () => {
    assert.deepEqual(parseTopics('releases,releases:strata,releases'), [
      'releases',
      'releases:strata',
    ]);
  });

  it('refuses none, too many, or malformed topics', () => {
    assert.equal(parseTopics(''), undefined);
    assert.equal(
      parseTopics(Array.from({ length: 13 }, (_, i) => `t${'a'.repeat(i)}`).join(',')),
      undefined,
    );
    assert.equal(parseTopics('Releases'), undefined);
    assert.equal(parseTopics('releases:../x'), undefined);
  });
});

describe('matches', () => {
  it('matches a whole topic or one key of it', () => {
    assert.ok(matches(['releases'], event('releases', 'strata')));
    assert.ok(matches(['releases:strata'], event('releases', 'strata')));
    assert.ok(!matches(['releases:tracker'], event('releases', 'strata')));
    assert.ok(!matches(['deploys'], event('releases', 'strata')));
  });
});

describe('newer', () => {
  it('orders stream ids by time, then sequence', () => {
    assert.ok(newer('2-0', '1-9'));
    assert.ok(newer('1-10', '1-9'));
    assert.ok(!newer('1-9', '1-9'));
    assert.ok(newer('1-0', undefined));
  });
});

describe('createClient', () => {
  function client(member: boolean, lastId?: string) {
    const frames: string[] = [];
    return {
      frames,
      client: createClient((chunk) => frames.push(chunk), ['releases'], member, lastId),
    };
  }

  it('coalesces a burst on one topic into one frame carrying the latest id', () => {
    mock.timers.enable({ apis: ['setTimeout'] });
    const { frames, client: live } = client(false);
    live.offer({ id: '1-0', event: event('releases', 'strata') });
    live.offer({ id: '1-1', event: event('releases', 'strata') });
    mock.timers.tick(100);
    mock.timers.reset();
    assert.equal(frames.length, 1);
    assert.match(frames[0], /^id: 1-1\n/);
  });

  it('skips replayed events at or before the last id it has sent', () => {
    mock.timers.enable({ apis: ['setTimeout'] });
    const { frames, client: live } = client(false, '5-0');
    live.offer({ id: '4-0', event: event('releases', 'a') });
    live.offer({ id: '5-0', event: event('releases', 'b') });
    live.offer({ id: '6-0', event: event('releases', 'c') });
    mock.timers.tick(100);
    mock.timers.reset();
    assert.equal(frames.length, 1);
    assert.match(frames[0], /^id: 6-0\n/);
  });

  it('sends private events to members only, and only the public projection to visitors', () => {
    mock.timers.enable({ apis: ['setTimeout'] });
    const visitor = client(false);
    const member = client(true);
    for (const live of [visitor.client, member.client]) {
      live.offer({ id: '1-0', event: event('releases', 'private', false) });
      live.offer({
        id: '1-1',
        event: { ...event('releases', 'public'), detail: { project: 'strata', host: 'x' } },
      });
    }
    mock.timers.tick(100);
    mock.timers.reset();
    assert.equal(visitor.frames.length, 1);
    assert.ok(!visitor.frames[0].includes('host'));
    assert.equal(member.frames.length, 2);
  });

  it('pushes a frame past the topic filter and flushes it at once', () => {
    mock.timers.enable({ apis: ['setTimeout'] });
    const { frames, client: live } = client(false);
    live.push({ event: { ...event('sessions'), public: false } });
    assert.equal(frames.length, 0);
    live.flush();
    assert.equal(frames.length, 1);
    mock.timers.tick(100);
    mock.timers.reset();
    assert.equal(frames.length, 1);
  });
});

describe('payload', () => {
  it('carries the detail of patched topics to everyone and keeps the rest to members', () => {
    const presence = { ...event('presence'), detail: { here: 3, online: ['amrmscll'] } };
    assert.deepEqual(payload(presence, false).data, { here: 3, online: ['amrmscll'] });
    const release = { ...event('releases'), detail: { project: 'strata', host: 'x' } };
    assert.ok(!('data' in payload(release, false)));
    assert.ok(!('event' in payload(release, false)));
    assert.deepEqual((payload(release, true) as { event?: HubEvent }).event, release);
  });
});

describe('console lines', () => {
  const deploy: HubEvent = {
    ...event('deploys', 'strata'),
    kind: 'deploy',
    detail: { project: 'strata', ok: true, host: 'x' },
  };

  it('carries the line of a recorded event under its activity id, and no line for the rest', () => {
    assert.deepEqual(payload(deploy, false, 42).console, {
      id: '42',
      kind: 'deploy',
      at: deploy.at,
      summary: 's',
      detail: { project: 'strata', ok: true },
    });
    assert.equal(payload(deploy, false).console, null);
    assert.equal(payload({ ...deploy, public: false }, true, 42).console, null);
    assert.equal(payload({ ...deploy, kind: 'uptime' }, false, 42).console, null);
  });

  it('writes one frame per event for every stream of the same audience', () => {
    const delivery = { id: '7-0', line: 42, event: deploy };
    assert.equal(frame(delivery, false), frame(delivery, false));
    assert.match(frame(delivery, false), /^id: 7-0\ndata: \{.*"console":\{"id":"42"/);
    assert.ok(!frame(delivery, false).includes('host'));
    assert.ok(frame(delivery, true).includes('host'));
    assert.match(frame({ line: 43, event: deploy }, false), /^data: /);
  });
});

describe('createLive', () => {
  function open(live: ReturnType<typeof createLive>, address: string) {
    const request = Object.assign(new EventEmitter(), {
      query: { topics: 'releases' },
      headers: {},
      socket: { remoteAddress: address },
    });
    const answered: { status?: number; body?: string } = {};
    const response = {
      status(code: number) {
        answered.status = code;
        return response;
      },
      set: () => response,
      type: () => response,
      send(body: string) {
        answered.body = body;
      },
      writeHead(code: number) {
        answered.status = code;
      },
      write: () => true,
      end() {},
      writableLength: 0,
    };
    return live
      .handler(request as unknown as Request, response as unknown as Response)
      .then(() => ({ answered, close: () => request.emit('close') }));
  }

  it('refuses the 21st stream from one address with 429 and gives the place back when one closes', async () => {
    const { bus } = recordingBus();
    const live = createLive(
      bus,
      { current: async () => undefined } as unknown as Auth,
      { join: async () => {}, touch: async () => {}, leave: async () => {} } as unknown as Presence,
      { handleOf: () => undefined, countryOf: () => undefined },
    );
    const streams = [];
    for (let stream = 0; stream < 20; stream += 1) {
      streams.push(await open(live, '203.0.113.7'));
    }
    assert.ok(streams.every((stream) => stream.answered.status === 200));
    assert.equal(live.connections, 20);
    const refused = await open(live, '203.0.113.7');
    assert.equal(refused.answered.status, 429);
    assert.equal(refused.answered.body, 'Too many live streams.');
    const elsewhere = await open(live, '198.51.100.9');
    assert.equal(elsewhere.answered.status, 200);
    streams[0].close();
    const again = await open(live, '203.0.113.7');
    assert.equal(again.answered.status, 200);
    [...streams, elsewhere, again].forEach((stream) => stream.close());
    assert.equal(live.connections, 0);
  });
});

describe('signedOut', () => {
  it('ends every member stream, or only that login, and never a visitor', () => {
    const everyone = { ...event('sessions'), key: undefined, public: false };
    const one = { ...event('sessions'), key: 'amrmscll', public: false };
    assert.ok(signedOut({ member: true, login: 'AmrMsCLL' }, everyone));
    assert.ok(signedOut({ member: true, login: 'AmrMsCLL' }, one));
    assert.ok(!signedOut({ member: true, login: 'Omar-Mohamed24' }, one));
    assert.ok(!signedOut({ member: false }, everyone));
    assert.ok(!signedOut({ member: true, login: 'AmrMsCLL' }, event('releases')));
  });
});

describe('parseKey', () => {
  it('accepts a slug or id and refuses anything else', () => {
    assert.equal(parseKey('strata'), 'strata');
    assert.equal(parseKey('0a1b2c3d4e5f6a7b'), '0a1b2c3d4e5f6a7b');
    assert.equal(parseKey('Strata'), undefined);
    assert.equal(parseKey(['a']), undefined);
    assert.equal(parseKey(''), undefined);
  });
});
