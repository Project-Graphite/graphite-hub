import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Refused } from '../app/profile.ts';
import { GitHubError } from './github.ts';
import { applyEntries, type RegistryEntry } from './registry.ts';
import { presentedProject } from './snapshot.ts';
import { memoryDatabase, recordingBus } from './testing.ts';
import { createWriteback, readPending, rewriteManifest, type GitHubCall } from './writeback.ts';

const MANIFEST = `# kept
projects:
  - slug: strata
    kind: project
    name: Strata
    summary: >
      A personal workspace for your dashboard, agenda, notes and files.
    tags: [react, nestjs]
    status: live
  - slug: other
    name: Other
`;

const ENTRY: RegistryEntry = {
  slug: 'strata',
  kind: 'project',
  name: 'Strata',
  summary: 'A personal workspace for your dashboard, agenda, notes and files.',
  tags: ['react', 'nestjs'],
  repo: 'project-graphite/strata',
  owner: 'amrmscll',
  authors: ['AmrMsCLL'],
  status: 'live',
  deploy: { kind: 'none' },
};

function fakeGitHub(options: { protectedBranch?: boolean; missing?: boolean } = {}) {
  const calls: { path: string; method: string; body: Record<string, unknown> }[] = [];
  let refused = options.protectedBranch ?? false;
  const call: GitHubCall = async <T>(path: string, init: RequestInit = {}) => {
    const method = init.method ?? 'GET';
    const body = init.body ? JSON.parse(String(init.body)) : {};
    calls.push({ path, method, body });
    if (path.endsWith('/contents/.graphite.yml') && method === 'GET') {
      if (options.missing) {
        throw new GitHubError(404, path);
      }
      return { content: Buffer.from(MANIFEST).toString('base64'), sha: 'abc' } as T;
    }
    if (path.endsWith('/contents/.graphite.yml') && method === 'PUT') {
      if (refused && !body.branch) {
        refused = false;
        throw new GitHubError(409, path);
      }
      return {} as T;
    }
    if (path === '/repos/project-graphite/strata') {
      return { default_branch: 'main' } as T;
    }
    if (path.endsWith('/git/ref/heads/main')) {
      return { object: { sha: 'head' } } as T;
    }
    if (path.endsWith('/pulls') && method === 'POST') {
      return { html_url: 'https://github.com/project-graphite/strata/pull/7' } as T;
    }
    if (path.endsWith('/pulls/7')) {
      return { state: 'closed', merged_at: null } as T;
    }
    return {} as T;
  };
  return { call, calls };
}

function setup(options?: Parameters<typeof fakeGitHub>[0]) {
  const db = memoryDatabase();
  applyEntries(db, [ENTRY], 'now');
  const { bus, published } = recordingBus();
  const github = fakeGitHub(options);
  return { db, published, github, writeback: createWriteback(db, bus, github.call) };
}

describe('registry write-back', () => {
  it('changes only the edited keys and keeps comments, folding and flow style', () => {
    const after = rewriteManifest(MANIFEST, 'strata', {
      name: 'Strata 2',
      tags: ['react', 'nestjs', 'redis'],
      pinned: true,
    });
    assert.match(after, /^# kept/);
    assert.match(after, /name: Strata 2/);
    assert.match(after, /tags: \[ react, nestjs, redis \]/);
    assert.match(after, /summary: >/);
    assert.match(after, /pinned: true/);
    assert.match(after, /- slug: other\n {4}name: Other/);
  });

  it('commits to the repository and shows the value as pending until the sync confirms it', async () => {
    const { db, github, writeback, published } = setup();
    const result = await writeback.write(
      'strata',
      { name: 'Strata 2', status: 'live' },
      'AmrMsCLL',
    );
    assert.equal(result.outcome, 'committed');
    const put = github.calls.find((call) => call.method === 'PUT')!;
    assert.equal(put.body.message, 'chore(registry): name for strata [skip ci]');
    assert.match(Buffer.from(String(put.body.content), 'base64').toString(), /name: Strata 2/);
    assert.equal(published[0].topic, 'projects');

    const pending = readPending(db).get('strata')!;
    const shown = presentedProject({ ...ENTRY, ...pending.fields }, undefined, pending);
    assert.equal(shown.name, 'Strata 2');
    assert.deepEqual(shown.pending, ['name']);

    await writeback.settle([{ ...ENTRY, name: 'Strata 2' }]);
    assert.equal(readPending(db).size, 0);
  });

  it('opens a pull request when the branch refuses the commit, and forgets it once closed unmerged', async () => {
    const { db, github, writeback } = setup({ protectedBranch: true });
    const result = await writeback.write('strata', { pinned: true }, 'AmrMsCLL');
    assert.equal(result.outcome, 'pull-request');
    assert.ok(github.calls.some((call) => call.path.endsWith('/git/refs')));
    assert.equal(
      readPending(db).get('strata')?.pullRequest,
      'https://github.com/project-graphite/strata/pull/7',
    );
    await writeback.settle([ENTRY]);
    assert.equal(readPending(db).size, 0);
  });

  it('writes nothing when nothing changed, and refuses bad values or a missing file', async () => {
    const { github, writeback } = setup();
    assert.equal((await writeback.write('strata', { name: 'Strata' }, 'x')).outcome, 'unchanged');
    assert.equal(github.calls.length, 0);
    await assert.rejects(writeback.write('strata', { tags: ['Not A Tag'] }, 'x'), Refused);
    await assert.rejects(writeback.write('strata', { summary: 'short' }, 'x'), Refused);
    await assert.rejects(
      setup({ missing: true }).writeback.write('strata', { name: 'New' }, 'x'),
      /no \.graphite\.yml/,
    );
  });
});
