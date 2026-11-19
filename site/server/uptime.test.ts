import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createJobs } from './jobs.ts';
import { applyEntries, type RegistryEntry } from './registry.ts';
import { memoryDatabase, recordingBus } from './testing.ts';
import { closeDays, createHealth, HEALTH_JOB, HEALTH_REF, liveHosts, span } from './uptime.ts';

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
      entry('strata', { name: 'Strata' }),
      entry('traceboard', { listed: false }),
      entry('message-lab', { status: 'archived', deploy: { kind: 'none' } }),
      entry('graphite-ui', { status: 'wip', deploy: { kind: 'none' } }),
    ],
    '2026-11-07T00:00:00.000Z',
  );
  return db;
}

function watch(db = fleet()) {
  let now = Date.parse('2026-11-07T10:00:00.000Z');
  const down = new Set<string>();
  const { bus, recorded, published } = recordingBus();
  const jobs = createJobs(db, {}, () => {});
  const health = createHealth(db, bus, jobs, {
    check: async (host) => (down.has(host) ? { ok: false, ms: null } : { ok: true, ms: 120 }),
    now: () => now,
  });
  const ping = async (seconds = 30) => {
    now += seconds * 1000;
    await health.ping();
  };
  return {
    db,
    jobs,
    health,
    recorded,
    published,
    down,
    ping,
    advance: (ms: number) => (now += ms),
  };
}

describe('liveHosts', () => {
  it('pings only the listed, live, deployed projects the site shows as running', () => {
    assert.deepEqual(liveHosts(fleet()), [
      { project: 'strata', host: 'strata.project-graphite.com' },
    ]);
  });

  it('stops probing a project the registry no longer lists', () => {
    const db = fleet();
    applyEntries(db, [entry('traceboard', { listed: false })], '2026-11-07T01:00:00.000Z');
    assert.deepEqual(liveHosts(db), []);
  });
});

describe('health', () => {
  it('says nothing while every probe answers', async () => {
    const { ping, recorded, published, db } = watch();
    await ping();
    await ping();
    assert.deepEqual(recorded, []);
    assert.equal(published.filter((event) => event.topic === 'ping').length, 2);
    assert.equal(db.prepare('SELECT count(*) AS n FROM uptime').get()!.n, 2);
  });

  it('records one line when a host fails two probes in a row and one more when it is back', async () => {
    const { ping, recorded, down } = watch();
    down.add('strata.project-graphite.com');
    await ping();
    assert.equal(recorded.length, 0);
    await ping();
    await ping();
    await ping(150);
    down.clear();
    await ping();
    await ping();
    assert.deepEqual(
      recorded.map((event) => [event.kind, event.topic, event.summary, event.detail]),
      [
        ['health', 'uptime', 'Strata is down', { project: 'strata', ok: false }],
        [
          'health',
          'uptime',
          'Strata was down for 4 min',
          { project: 'strata', ok: true, downMs: 240_000 },
        ],
      ],
    );
  });

  it('does not call one failed probe an outage', async () => {
    const { ping, recorded, down } = watch();
    down.add('strata.project-graphite.com');
    await ping();
    down.clear();
    await ping();
    down.add('strata.project-graphite.com');
    await ping();
    assert.deepEqual(recorded, []);
  });

  it('remembers an outage across a restart and reports the recovery once', async () => {
    const first = watch();
    first.down.add('strata.project-graphite.com');
    await first.ping();
    await first.ping();
    const second = watch(first.db);
    second.down.add('strata.project-graphite.com');
    await second.ping();
    await second.ping();
    assert.equal(second.recorded.length, 0);
    second.down.clear();
    await second.ping();
    assert.equal(second.recorded.length, 1);
    assert.match(second.recorded[0].summary, /^Strata was down for /);
  });

  it('records one digest for a day with no change and never repeats it', async () => {
    const { db, health, recorded, advance } = watch();
    const insert = db.prepare('INSERT INTO uptime (project, minute, ok, ms) VALUES (?, ?, ?, ?)');
    for (let minute = 0; minute < 60; minute += 1) {
      const at = `2026-11-07T09:${String(minute).padStart(2, '0')}`;
      insert.run('strata', at, 1, 100 + minute);
      insert.run('message-lab', at, 0, null);
    }
    advance(86_400_000);
    await health.digest();
    await health.digest();
    assert.deepEqual(
      recorded.map((event) => [event.kind, event.summary, event.detail]),
      [['health', 'all 1 up for 24 h, p95 156 ms', { up: 1, total: 1, p95Ms: 156 }]],
    );
  });

  it('counts the projects that had a failed minute out of the digest', async () => {
    const { db, health, recorded, advance } = watch();
    db.prepare(
      "INSERT INTO uptime (project, minute, ok, ms) VALUES ('strata', '2026-11-07T09:00', 0, NULL)",
    ).run();
    advance(86_400_000);
    await health.digest();
    assert.equal(recorded[0].summary, '0 of 1 up for 24 h');
  });

  it('arms itself for the next midnight in UTC and only once', () => {
    const { db, health } = watch();
    health.start();
    health.start();
    assert.deepEqual(
      db
        .prepare('SELECT kind, ref, due_at FROM jobs')
        .all()
        .map((row) => ({ ...row })),
      [{ kind: HEALTH_JOB, ref: HEALTH_REF, due_at: '2026-11-08T00:00:00.000Z' }],
    );
  });
});

describe('closeDays', () => {
  it('rolls every finished day into one row, once, and leaves today alone', () => {
    const db = fleet();
    const insert = db.prepare('INSERT INTO uptime (project, minute, ok, ms) VALUES (?, ?, ?, ?)');
    insert.run('strata', '2026-11-05T10:00', 1, 100);
    insert.run('strata', '2026-11-05T10:01', 0, null);
    insert.run('strata', '2026-11-06T10:00', 1, 80);
    insert.run('strata', '2026-11-07T10:00', 1, 90);
    closeDays(db, '2026-11-07');
    closeDays(db, '2026-11-07');
    assert.deepEqual(
      db
        .prepare('SELECT day, minutes, up, p95_ms FROM uptime_days ORDER BY day')
        .all()
        .map((row) => ({ ...row })),
      [
        { day: '2026-11-05', minutes: 2, up: 1, p95_ms: 100 },
        { day: '2026-11-06', minutes: 1, up: 1, p95_ms: 80 },
      ],
    );
    assert.equal(db.prepare('SELECT count(*) AS n FROM uptime').get()!.n, 4);
  });
});

describe('span', () => {
  it('reads as a length of time', () => {
    assert.equal(span(20_000), 'under a minute');
    assert.equal(span(240_000), '4 min');
    assert.equal(span(4_320_000), '1 h 12 min');
  });
});
