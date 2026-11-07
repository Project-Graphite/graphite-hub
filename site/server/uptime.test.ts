import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { applyEntries, type RegistryEntry } from './registry.ts';
import { memoryDatabase, recordingBus } from './testing.ts';
import { liveHosts, recordUptimeSummary } from './uptime.ts';

const entry = (slug: string, overrides: Partial<RegistryEntry>): RegistryEntry => ({
  slug,
  kind: 'project',
  name: slug,
  summary: 'A project summary long enough to pass.',
  repo: `project-graphite/${slug}`,
  owner: 'amrmscll',
  authors: ['AmrMsCLL'],
  status: 'live',
  deploy: { kind: 'compose', host: `${slug}.project-graphite.com` },
  ...overrides,
});

function fleet() {
  const db = memoryDatabase();
  applyEntries(
    db,
    [
      entry('strata', {}),
      entry('traceboard', { listed: false }),
      entry('message-lab', { status: 'archived', deploy: { kind: 'none' } }),
      entry('graphite-ui', { status: 'wip', deploy: { kind: 'none' } }),
    ],
    '2026-11-07T00:00:00.000Z',
  );
  return db;
}

describe('liveHosts', () => {
  it('pings only the listed, live, deployed projects the site shows as running', () => {
    assert.deepEqual(liveHosts(fleet()), [
      { project: 'strata', host: 'strata.project-graphite.com' },
    ]);
  });
});

describe('recordUptimeSummary', () => {
  it('counts the running fleet only, not retired or unlisted projects with old checks', async () => {
    const db = fleet();
    const minute = new Date().toISOString().slice(0, 16);
    const insert = db.prepare('INSERT INTO uptime (project, minute, ok, ms) VALUES (?, ?, ?, ?)');
    insert.run('strata', minute, 1, 120);
    insert.run('traceboard', minute, 0, null);
    insert.run('message-lab', minute, 1, 90);
    const { bus, recorded } = recordingBus();

    await recordUptimeSummary(db, bus);

    assert.equal(recorded.length, 1);
    assert.equal(recorded[0].summary, '1 of 1 up over the last hour');
    assert.deepEqual(recorded[0].detail, { up: 1, total: 1, p95Ms: 120 });
  });

  it('records nothing while the fleet has no checks yet', async () => {
    const { bus, recorded } = recordingBus();
    await recordUptimeSummary(fleet(), bus);
    assert.equal(recorded.length, 0);
  });
});
