import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import { createBus, type HubEvent } from './bus.ts';
import { readProjects } from './projects.ts';
import type { Redis } from './redis.ts';
import type { RegistryEntry } from './registry.ts';
import type { Sessions } from './sessions.ts';
import { coalesced, createSync } from './sync.ts';
import { memoryDatabase } from './testing.ts';
import { liveHosts } from './uptime.ts';

const PLATFORM = '/repos/Project-Graphite/platform/contents';

const entry = (slug: string, overrides: Partial<RegistryEntry> = {}): RegistryEntry => ({
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

function github() {
  const answers = new Map<string, unknown>();
  const stars = new Map<string, number>();
  const world = {
    answers,
    stars,
    registry(entries: RegistryEntry[], broken: string[] = []) {
      for (const path of [...answers.keys()].filter((key) => key.startsWith(PLATFORM))) {
        answers.delete(path);
      }
      answers.set(
        `${PLATFORM}/schema/project.schema.json`,
        JSON.stringify({ type: 'object', required: ['slug', 'name'] }),
      );
      answers.set(
        `${PLATFORM}/projects`,
        [...entries.map((item) => item.slug), ...broken].map((slug) => ({
          name: `${slug}.yml`,
          type: 'file',
        })),
      );
      for (const item of entries) {
        answers.set(`${PLATFORM}/projects/${item.slug}.yml`, JSON.stringify(item));
        answers.set(`/repos/${item.repo}/releases?per_page=30`, []);
      }
      for (const slug of broken) {
        answers.set(`${PLATFORM}/projects/${slug}.yml`, 'slug: 12');
      }
    },
    members(logins: string[]) {
      answers.set('/orgs/Project-Graphite/members?per_page=100&page=1', toLogins(logins));
      answers.set(
        '/orgs/Project-Graphite/members?role=admin&per_page=100&page=1',
        toLogins(logins.slice(0, 1)),
      );
      for (const login of logins) {
        answers.set(`/users/${login}`, {
          login,
          name: `${login} Surname`,
          avatar_url: `https://avatars.example/${login}`,
          public_repos: 3,
          followers: 2,
          created_at: '2020-01-01T00:00:00Z',
        });
      }
    },
  };
  mock.method(globalThis, 'fetch', async (input: string | URL) => {
    const path = String(input).replace('https://api.github.com', '');
    const repo = path.match(/^\/repos\/([^/]+\/[^/]+)(\/languages)?$/);
    const answer = repo
      ? repo[2]
        ? { TypeScript: 1 }
        : {
            full_name: repo[1],
            stargazers_count: stars.get(repo[1]) ?? 0,
            forks_count: 0,
            open_issues_count: 0,
            pushed_at: null,
          }
      : answers.get(path);
    return answer === undefined
      ? new Response('missing', { status: 404 })
      : new Response(typeof answer === 'string' ? answer : JSON.stringify(answer));
  });
  return world;
}

function toLogins(logins: string[]) {
  return logins.map((login) => ({ login }));
}

function setup() {
  const db = memoryDatabase();
  const world = github();
  world.registry([entry('strata', { name: 'Strata' }), entry('tracker', { name: 'Tracker' })]);
  world.members(['AmrMsCLL', 'Nier0o']);
  const bus = createBus(db, { xadd: async () => '1-0' } as unknown as Redis);
  const heard: HubEvent[] = [];
  bus.listen(({ event }) => heard.push(event));
  const revoked: string[] = [];
  const captured: [string, string | undefined][] = [];
  const sync = createSync(
    db,
    bus,
    {
      revoke: async (login: string) => {
        revoked.push(login);
        return 1;
      },
    } as unknown as Sessions,
    (error, where) => captured.push([(error as Error).message, where?.route]),
  );
  const lines = () =>
    db
      .prepare('SELECT kind, summary FROM activity WHERE public = 1 ORDER BY id')
      .all()
      .map((row) => `${row.kind as string}: ${row.summary as string}`);
  return { db, world, sync, heard, revoked, captured, lines };
}

afterEach(() => mock.restoreAll());

describe('sync', () => {
  it('seeds everything on the first full sync and says so in two lines', async () => {
    const { db, sync, lines, captured } = setup();
    await sync.full();
    assert.deepEqual(captured, []);
    assert.deepEqual(
      readProjects(db).map((project) => project.name),
      ['Strata', 'Tracker'],
    );
    assert.deepEqual(
      db
        .prepare('SELECT handle, role, left_at FROM members ORDER BY handle')
        .all()
        .map((row) => ({ ...row })),
      [
        { handle: 'amrmscll', role: 'owner', left_at: null },
        { handle: 'nier0o', role: 'member', left_at: null },
      ],
    );
    assert.deepEqual(lines(), [
      'sync: Registry synced: 2 added, 0 changed, 0 removed',
      'sync: Changelog started: 2 projects at 1.0.0',
    ]);
    await sync.full();
    assert.equal(lines().length, 2);
  });

  it('removes nothing when one registry file is invalid, and soft-removes on a clean listing', async () => {
    const { db, world, sync, lines } = setup();
    await sync.full();
    world.registry([entry('strata', { name: 'Strata' })], ['tracker']);
    await sync.full();
    assert.deepEqual(
      readProjects(db).map((project) => project.slug),
      ['strata', 'tracker'],
    );
    assert.equal(lines().length, 2);
    world.registry([entry('strata', { name: 'Strata' })]);
    await sync.full();
    assert.deepEqual(
      readProjects(db).map((project) => project.slug),
      ['strata'],
    );
    assert.deepEqual(liveHosts(db), [{ project: 'strata', host: 'strata.project-graphite.com' }]);
    assert.equal(lines().at(-1), 'sync: Registry synced: 0 added, 0 changed, 1 removed');
    world.registry([entry('strata', { name: 'Strata' }), entry('tracker', { name: 'Renamed' })]);
    await sync.full();
    assert.deepEqual(
      readProjects(db).map((project) => project.name),
      ['Strata', 'Tracker'],
    );
    assert.deepEqual(lines().slice(-2), [
      'sync: Registry synced: 1 added, 0 changed, 0 removed',
      'project: Tracker was added',
    ]);
  });

  it('archives a live project the registry stops deploying, with one console line', async () => {
    const { db, world, sync, lines } = setup();
    await sync.full();
    world.registry([
      entry('strata', { name: 'Strata', deploy: { kind: 'none' } }),
      entry('tracker', { name: 'Tracker' }),
    ]);
    await sync.full();
    await sync.full();
    assert.equal(readProjects(db)[0].status, 'archived');
    assert.deepEqual(lines().slice(2), [
      'sync: Registry synced: 0 added, 1 changed, 0 removed',
      'project: Strata is now archived',
    ]);
    assert.deepEqual(liveHosts(db), [{ project: 'tracker', host: 'tracker.project-graphite.com' }]);
  });

  it('marks a member who left, ends their sessions, and greets one who joins', async () => {
    const { db, world, sync, lines, revoked, heard } = setup();
    await sync.full();
    world.members(['AmrMsCLL', 'Omar-Mohamed24']);
    await sync.full();
    assert.deepEqual(revoked, ['Nier0o']);
    assert.ok(heard.some((event) => event.topic === 'sessions' && event.key === 'nier0o'));
    assert.deepEqual(
      db
        .prepare('SELECT handle, left_at IS NOT NULL AS gone FROM members ORDER BY handle')
        .all()
        .map((row) => [row.handle, row.gone]),
      [
        ['amrmscll', 0],
        ['nier0o', 1],
        ['omar-mohamed24', 0],
      ],
    );
    assert.equal(lines().at(-1), 'member: Omar-Mohamed24 joined');
    await sync.full();
    assert.deepEqual(revoked, ['Nier0o']);
    world.members(['AmrMsCLL', 'Omar-Mohamed24', 'Nier0o']);
    await sync.full();
    assert.equal(lines().at(-1), 'member: Nier0o joined');
    assert.equal(db.prepare('SELECT count(*) AS n FROM members WHERE left_at IS NULL').get()!.n, 3);
  });

  it('records a star line when a count rises, and nothing when it falls', async () => {
    const { world, sync, lines } = setup();
    await sync.full();
    world.stars.set('project-graphite/strata', 12);
    world.stars.set('project-graphite/tracker', 1);
    await sync.full();
    assert.deepEqual(lines().slice(2), [
      'star: Strata reached 12 stars',
      'star: Tracker reached 1 star',
    ]);
    world.stars.set('project-graphite/strata', 11);
    await sync.full();
    assert.equal(lines().length, 4);
  });

  it('carries on with the other steps when one fails, and captures the failure', async () => {
    const { db, world, sync, captured } = setup();
    await sync.full();
    world.answers.delete('/orgs/Project-Graphite/members?per_page=100&page=1');
    world.stars.set('project-graphite/strata', 5);
    await sync.full();
    assert.deepEqual(captured, [
      [
        'GitHub answered 404 for /orgs/Project-Graphite/members?per_page=100&page=1',
        'sync:members',
      ],
    ]);
    assert.equal(
      db.prepare("SELECT stars FROM repo_stats WHERE repo = 'project-graphite/strata'").get()!
        .stars,
      5,
    );
  });
});

describe('coalesced', () => {
  it('runs once more after the run in flight, however many asked meanwhile', async () => {
    const releases: (() => void)[] = [];
    const run = coalesced(() => new Promise<void>((resolve) => releases.push(resolve)));
    const first = run();
    const second = run();
    const third = run();
    assert.equal(second, third);
    assert.notEqual(first, second);
    assert.equal(releases.length, 1);
    releases[0]();
    await first;
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(releases.length, 2);
    releases[1]();
    await second;
    assert.equal(releases.length, 2);
  });
});
