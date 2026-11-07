import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import type { HubEvent } from './bus.ts';
import { createClient, matches, newer, parseKey, parseTopics, payload, signedOut } from './live.ts';

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
