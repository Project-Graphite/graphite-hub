import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import type { HubEvent } from './bus.ts';
import { createClient, matches, newer, parseTopics } from './live.ts';

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
});
