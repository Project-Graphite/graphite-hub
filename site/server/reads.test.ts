import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createModel } from '../app/model.ts';
import type { Directory, Project } from '../app/types.ts';
import { createReads } from './reads.ts';
import { applyEntries, type RegistryEntry } from './registry.ts';
import { memoryDatabase, recordingBus } from './testing.ts';
import { closeDays } from './uptime.ts';

const NOW = Date.parse('2026-11-18T12:00:00.000Z');

const entry = (slug: string): RegistryEntry => ({
  slug,
  kind: 'project',
  name: slug,
  summary: 'A project summary long enough to pass.',
  repo: `project-graphite/${slug}`,
  owner: 'amrmscll',
  authors: ['AmrMsCLL'],
  status: 'live',
  deploy: { kind: 'compose', host: `${slug}.project-graphite.com` },
});

function activity() {
  const db = memoryDatabase();
  const insert = db.prepare(
    'INSERT INTO activity (kind, public, summary, detail, at) VALUES (?, ?, ?, ?, ?)',
  );
  return {
    db,
    add: (kind: string, summary: string, at: string, isPublic = 1) =>
      insert.run(kind, isPublic, summary, '{}', at),
  };
}

function probed() {
  const db = memoryDatabase();
  applyEntries(db, [entry('strata'), entry('tracker')], '2026-11-01T00:00:00.000Z');
  const insert = db.prepare('INSERT INTO uptime (project, minute, ok, ms) VALUES (?, ?, ?, ?)');
  const directory = {
    projects: ['strata', 'tracker'].map((slug) => ({
      slug,
      name: slug,
      path: `/${slug}`,
      status: 'live',
      url: `https://${slug}.project-graphite.com`,
    })) as Project[],
  } as Directory;
  return { db, insert, directory };
}

describe('reads', () => {
  it('finds the latest lines of the asked kinds behind newer lines of other kinds', () => {
    const db = memoryDatabase();
    const insert = db.prepare(
      'INSERT INTO activity (kind, public, summary, detail, at, seq) VALUES (?, 1, ?, ?, ?, ?)',
    );
    insert.run('deploy', 'strata deployed', '{"project":"strata"}', '2026-11-06T08:00:00Z', '1-0');
    for (let hour = 9; hour < 21; hour++) {
      insert.run(
        'sync',
        `Registry synced at ${hour}`,
        '{"changed":["strata"]}',
        `2026-11-06T${hour}:00:00Z`,
        `${hour}-0`,
      );
    }

    assert.deepEqual(
      createReads(db)
        .consoleLines(8, ['deploy', 'release'])
        .map((line) => line.summary),
      ['strata deployed'],
    );
    assert.equal(createReads(db).consoleLines(8).length, 8);
    assert.deepEqual(createReads(db).consoleLines(8, []), []);
  });

  it('shows a line whose event never reached the replay stream, under its own id', () => {
    const { db, add } = activity();
    add('deploy', 'strata deployed', '2026-11-06T08:00:00Z');
    assert.deepEqual(
      createReads(db)
        .consoleLines(8)
        .map((line) => [line.id, line.summary]),
      [['1', 'strata deployed']],
    );
  });

  it('leaves the hourly uptime rows of the old console unread', () => {
    const { db, add } = activity();
    add('deploy', 'strata deployed', '2026-11-06T08:00:00Z');
    for (let hour = 9; hour < 21; hour++) {
      add('uptime', '4 of 4 up over the last hour', `2026-11-06T${hour}:00:00Z`);
    }
    assert.deepEqual(
      createReads(db)
        .consoleLines(8)
        .map((line) => line.summary),
      ['strata deployed'],
    );
  });

  it('folds a run of the same line into one with a count', () => {
    const { db, add } = activity();
    add('deploy', 'strata deployed', '2026-11-06T08:00:00Z');
    for (let minute = 10; minute < 15; minute++) {
      add('wall', 'a new message on the wall', `2026-11-06T09:${minute}:00Z`);
    }
    add('release', 'Strata 1.2.0', '2026-11-06T10:00:00Z');
    add('wall', 'a new message on the wall', '2026-11-06T11:00:00Z');
    assert.deepEqual(
      createReads(db)
        .consoleLines(8)
        .map((line) => [line.id, line.summary, line.count]),
      [
        ['1', 'strata deployed', undefined],
        ['6', 'a new message on the wall', 5],
        ['7', 'Strata 1.2.0', undefined],
        ['8', 'a new message on the wall', undefined],
      ],
    );
  });

  it('gives the activity line one line of each kind before it repeats a kind', () => {
    const { db, add } = activity();
    add('release', 'Strata 1.0.0', '2026-11-01T08:00:00Z');
    add('star', 'Strata reached 3 stars', '2026-11-02T08:00:00Z');
    add('lifecycle', 'Nightly retention ran', '2026-11-02T09:00:00Z', 0);
    for (let day = 3; day < 15; day++) {
      add('deploy', `strata deployed ${day}`, `2026-11-${String(day).padStart(2, '0')}T08:00:00Z`);
    }
    add('member', 'Omar joined', '2026-11-15T08:00:00Z');
    const ticker = createReads(db).ticker(8);
    assert.deepEqual(
      ticker.map((line) => line.kind),
      ['member', 'deploy', 'star', 'release', 'deploy', 'deploy', 'deploy', 'deploy'],
    );
    assert.deepEqual(
      ticker.slice(0, 5).map((line) => line.summary),
      [
        'Omar joined',
        'strata deployed 14',
        'Strata reached 3 stars',
        'Strata 1.0.0',
        'strata deployed 13',
      ],
    );
    assert.equal(new Set(ticker.map((line) => line.id)).size, 8);
    assert.deepEqual(
      createReads(db)
        .ticker(2)
        .map((line) => line.kind),
      ['member', 'deploy'],
    );
  });

  it('reads the week and the grid from closed days plus the minutes still open', () => {
    const { db, insert, directory } = probed();
    insert.run('strata', '2026-11-15T10:00', 1, 100);
    insert.run('strata', '2026-11-16T10:00', 0, null);
    insert.run('strata', '2026-11-16T10:01', 1, 300);
    insert.run('strata', '2026-11-18T09:00', 1, 200);
    insert.run('tracker', '2026-11-18T09:00', 0, null);
    const expected = {
      week: ['none', 'none', 'none', 'up', 'down', 'none', 'up'],
      days: ['none', 'up', 'down', 'none', 'up'],
    };
    for (const [closed, p95Ms] of [
      [false, 300],
      [true, 225],
    ] as const) {
      if (closed) {
        closeDays(db, '2026-11-18');
        db.prepare("DELETE FROM uptime WHERE minute < '2026-11-18'").run();
      }
      const reads = createReads(db);
      const [strata, tracker] = reads.running(directory, NOW);
      assert.deepEqual(strata.week, expected.week);
      assert.deepEqual(tracker.week, ['none', 'none', 'none', 'none', 'none', 'none', 'down']);
      const uptime = reads.uptime(5, NOW);
      assert.deepEqual(uptime.strata.days, expected.days);
      assert.equal(uptime.strata.p95Ms, p95Ms);
      assert.equal(uptime.tracker.p95Ms, null);
      assert.deepEqual(reads.upNow(), ['strata']);
    }
  });

  it('remembers the uptime reads until a probe, a deploy or a project changes', () => {
    const { db, insert, directory } = probed();
    const { bus, published } = recordingBus();
    const reads = createReads(db, bus);
    insert.run('strata', '2026-11-18T09:00', 1, 200);
    assert.deepEqual(reads.upNow(), ['strata']);
    assert.equal(reads.running(directory, NOW)[1].week.at(-1), 'none');
    insert.run('strata', '2026-11-18T09:01', 0, null);
    insert.run('tracker', '2026-11-18T09:01', 1, 90);
    assert.deepEqual(reads.upNow(), ['strata']);
    assert.equal(reads.running(directory, NOW)[1].week.at(-1), 'none');
    void bus.publish({
      topic: 'ping',
      kind: 'ping',
      public: true,
      summary: 'tracker up',
      detail: {},
      at: '2026-11-18T09:01:00.000Z',
    });
    assert.equal(published.length, 1);
    assert.deepEqual(reads.upNow(), ['tracker']);
    assert.equal(reads.running(directory, NOW)[1].week.at(-1), 'up');
  });

  it('counts listed members, the projects /projects lists and every release', () => {
    const model = createModel({
      members: [
        { handle: 'amr', listed: true },
        { handle: 'ghost', listed: false },
      ],
      projects: [
        { slug: 'strata', parent: null, kind: 'project' },
        { slug: 'windhawk-mods', parent: null, kind: 'epic' },
        { slug: 'tasktune', parent: 'windhawk-mods', kind: 'project' },
      ],
      releases: [
        { id: '1', project: 'strata' },
        { id: '2', project: 'windhawk-mods' },
        { id: '3', project: 'tasktune' },
      ],
    } as unknown as Directory);

    const counts = createReads(memoryDatabase()).counts(model, []);
    assert.equal(counts.members, 1);
    assert.equal(counts.projects, 1);
    assert.equal(counts.releases, 3);
  });

  it('reads the change groups of the asked releases in one query', () => {
    const db = memoryDatabase();
    const insert = db.prepare(
      "INSERT INTO releases (id, project, version, date, groups) VALUES (?, 'strata', ?, '2026-11-10', ?)",
    );
    const added = [
      { type: 'added', changes: [{ text: 'Boards', commit: null, pr: 4, author: null }] },
    ];
    insert.run('strata-1.1.0', '1.1.0', JSON.stringify(added));
    insert.run('strata-1.0.0', '1.0.0', '[]');
    insert.run('strata-0.9.0', '0.9.0', '[]');

    assert.deepEqual(createReads(db).releaseGroups(['strata-1.1.0', 'strata-1.0.0', 'gone']), {
      'strata-1.1.0': added,
      'strata-1.0.0': [],
    });
  });

  it('dates a member page by its last profile edit or by joining, and a project by its last edit', () => {
    const db = memoryDatabase();
    const member = db.prepare(
      "INSERT INTO members (handle, login, name, avatar_url, role, joined_at, synced_at) VALUES (?, ?, ?, '', 'member', ?, '2026-11-18T00:00:00.000Z')",
    );
    member.run('amrmscll', 'AmrMsCLL', 'Amr', '2026-11-05T00:00:00.000Z');
    member.run('fresh', 'Fresh', 'Fresh', '2026-11-12T00:00:00.000Z');
    db.prepare('UPDATE profiles SET updated_at = ? WHERE handle = ?').run(
      '2026-11-09T08:00:00.000Z',
      'amrmscll',
    );
    const project = db.prepare(
      "INSERT INTO projects (slug, repo, entry, synced_at, edited_at) VALUES (?, ?, '{}', '2026-11-18T00:00:00.000Z', ?)",
    );
    project.run('strata', 'project-graphite/strata', '2026-11-11T07:00:00.000Z');
    project.run('stagehand', 'project-graphite/stagehand', null);

    assert.deepEqual(createReads(db).edited(), {
      members: { amrmscll: '2026-11-09T08:00:00.000Z', fresh: '2026-11-12T00:00:00.000Z' },
      projects: { strata: '2026-11-11T07:00:00.000Z' },
    });
  });
});
