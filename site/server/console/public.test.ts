import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CONSOLE_KINDS, type ConsoleKind } from '../../app/console.ts';
import type { HubEvent } from '../bus.ts';
import { toPublicEvent } from './public.ts';

const FORBIDDEN = {
  host: 'strata.project-graphite.com',
  path: '/srv/graphite/strata/compose.yaml',
  container: 'strata-app-1',
  environment: 'production',
  env: 'DATABASE_URL=postgres://user:pass@db/strata',
  token: 'ghs_secretvalue',
  ip: '203.0.113.7',
  address: '203.0.113.7',
  title: 'Draft: unannounced plans',
  draftTitle: 'Draft: unannounced plans',
};

const FORBIDDEN_VALUES = Object.values(FORBIDDEN);

function event(kind: string, detail: Record<string, unknown>, isPublic = true): HubEvent {
  return {
    topic: 'console',
    kind,
    public: isPublic,
    summary: `${kind} happened`,
    detail: { ...detail, ...FORBIDDEN, nested: FORBIDDEN },
    at: '2026-11-05T00:00:00.000Z',
  };
}

function assertClean(value: unknown) {
  const serialised = JSON.stringify(value);
  for (const key of Object.keys(FORBIDDEN)) {
    assert.ok(!serialised.includes(`"${key}"`), `${key} reached the public console`);
  }
  for (const forbidden of FORBIDDEN_VALUES) {
    assert.ok(!serialised.includes(forbidden), `${forbidden} reached the public console`);
  }
}

describe('toPublicEvent', () => {
  it('keeps only the allowed deploy fields, with a short tag', () => {
    const projected = toPublicEvent(
      event('deploy', {
        project: 'strata',
        tag: 'sha-00e840f1234',
        ok: true,
        durationMs: 4200,
        healthStatus: 200,
        healthMs: 38,
      }),
    );
    assert.deepEqual(projected?.detail, {
      project: 'strata',
      tag: '00e840f',
      ok: true,
      durationMs: 4200,
      healthStatus: 200,
      healthMs: 38,
    });
    assertClean(projected);
  });

  const DETAILS: Record<Exclude<ConsoleKind, 'deploy' | 'post'>, Record<string, unknown>> = {
    release: { project: 'strata', version: '1.2.0', counts: { added: 2, host: 'x' } },
    sync: { added: ['strata'], changed: [], removed: [], stars: { 'project-graphite/strata': 1 } },
    health: { project: 'strata', ok: true, downMs: 240_000, up: 4, total: 4, p95Ms: 210 },
    star: { project: 'strata', stars: 12 },
    member: { member: 'omar-mohamed24', change: 'joined' },
    project: { project: 'pixelpocket', status: 'live' },
    wall: { name: 'Mona', body: 'Hello from Cairo' },
    milestone: { project: 'strata', views: 100 },
  };

  for (const [kind, detail] of Object.entries(DETAILS)) {
    it(`never lets a forbidden field through on ${kind}`, () => {
      const projected = toPublicEvent(event(kind, detail));
      assert.ok(projected);
      assertClean(projected);
    });
  }

  it('has a projection for every kind the console shows', () => {
    assert.deepEqual([...Object.keys(DETAILS), 'deploy', 'post'].sort(), [...CONSOLE_KINDS].sort());
    for (const kind of CONSOLE_KINDS) {
      assert.ok(toPublicEvent(event(kind, {})), `${kind} has no projection`);
    }
  });

  it('keeps only what each new kind names', () => {
    assert.deepEqual(toPublicEvent(event('health', DETAILS.health))?.detail, DETAILS.health);
    assert.deepEqual(toPublicEvent(event('star', DETAILS.star))?.detail, DETAILS.star);
    assert.deepEqual(toPublicEvent(event('member', DETAILS.member))?.detail, DETAILS.member);
    assert.deepEqual(toPublicEvent(event('project', DETAILS.project))?.detail, DETAILS.project);
    assert.deepEqual(toPublicEvent(event('wall', DETAILS.wall))?.detail, {});
    assert.deepEqual(
      toPublicEvent(event('milestone', DETAILS.milestone))?.detail,
      DETAILS.milestone,
    );
  });

  it('hides private events and kinds without a projection', () => {
    assert.equal(toPublicEvent(event('deploy', { project: 'strata' }, false)), null);
    assert.equal(toPublicEvent(event('lifecycle', {})), null);
    assert.equal(toPublicEvent(event('error', {})), null);
    assert.equal(toPublicEvent(event('uptime', { up: 5, total: 6, p95Ms: 120 })), null);
  });
});
