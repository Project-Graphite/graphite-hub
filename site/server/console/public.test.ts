import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
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

  for (const [kind, detail] of Object.entries({
    release: { project: 'strata', version: '1.2.0', counts: { added: 2, host: 'x' } },
    sync: { added: ['strata'], changed: [], removed: [], stars: { 'project-graphite/strata': 1 } },
    uptime: { up: 5, total: 6, p95Ms: 120 },
  })) {
    it(`never lets a forbidden field through on ${kind}`, () => {
      const projected = toPublicEvent(event(kind, detail));
      assert.ok(projected);
      assertClean(projected);
    });
  }

  it('hides private events and kinds without a projection', () => {
    assert.equal(toPublicEvent(event('deploy', { project: 'strata' }, false)), null);
    assert.equal(toPublicEvent(event('lifecycle', {})), null);
    assert.equal(toPublicEvent(event('error', {})), null);
  });
});
