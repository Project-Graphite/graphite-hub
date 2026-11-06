import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { changelogPath, createModel } from '../app/model.ts';
import type { Directory, Member, Project } from '../app/types.ts';
import { projectFromEntry } from './snapshot.ts';

function project(slug: string, extra: Partial<Project> = {}): Project {
  return {
    slug,
    parent: null,
    kind: 'project',
    name: slug,
    summary: '',
    tags: [],
    repo: `project-graphite/${slug}`,
    repoUrl: '',
    owner: 'amrmscll',
    authors: ['AmrMsCLL'],
    status: 'live',
    pinned: false,
    showcase: null,
    url: null,
    path: extra.parent ? `/${extra.parent}/${slug}` : `/${slug}`,
    coverUrl: null,
    accent: null,
    layout: 'window',
    feature: { note: '', screenshotUrl: null, posts: [] },
    pending: [],
    pullRequest: null,
    ...extra,
  };
}

const amr = {
  handle: 'amrmscll',
  alias: 'amr',
  github: 'AmrMsCLL',
  name: 'Amr',
  path: '/amr',
} as Member;
const omar = {
  handle: 'omar-mohamed24',
  alias: null,
  github: 'Omar-Mohamed24',
  name: 'Omar',
  path: '/members/omar-mohamed24',
} as Member;

const model = createModel({
  members: [amr, omar],
  projects: [
    project('strata'),
    project('windhawk-mods', { kind: 'epic' }),
    project('tasktune', { parent: 'windhawk-mods' }),
    project('pixelpocket', { owner: 'omar-mohamed24', authors: ['Omar-Mohamed24'] }),
  ],
  releases: [],
  posts: [],
} as Directory);

describe('addresses', () => {
  it('puts projects at the root and projects in an epic under it', () => {
    const entry = {
      slug: 'tasktune',
      parent: 'windhawk-mods',
      kind: 'project' as const,
      name: 'TaskTune',
      summary: 's',
      repo: 'project-graphite/windhawk-mods',
      owner: 'amrmscll',
      authors: ['AmrMsCLL'],
      status: 'live' as const,
      deploy: { kind: 'none' as const },
    };
    assert.equal(projectFromEntry(entry).path, '/windhawk-mods/tasktune');
    assert.equal(projectFromEntry({ ...entry, parent: undefined }).path, '/tasktune');
  });

  it('resolves projects, aliases, epic children and member-scoped projects', () => {
    assert.equal(model.resolve('/strata').project?.slug, 'strata');
    assert.equal(model.resolve('/amr').member?.handle, 'amrmscll');
    assert.equal(model.resolve('/members/omar-mohamed24').member?.handle, 'omar-mohamed24');
    assert.equal(model.resolve('/windhawk-mods/tasktune').project?.slug, 'tasktune');
    assert.equal(model.resolve('/amr/strata').project?.path, '/strata');
    assert.deepEqual(model.resolve('/amr/pixelpocket'), {});
    assert.deepEqual(model.resolve('/nobody'), {});
  });

  it('keeps the changelog addresses as they were', () => {
    assert.equal(changelogPath(model.projectBySlug('strata')!), '/changelog/projects/strata');
    assert.equal(
      changelogPath(model.projectBySlug('windhawk-mods')!),
      '/changelog/epics/windhawk-mods',
    );
    assert.equal(
      changelogPath(model.projectBySlug('tasktune')!),
      '/changelog/epics/windhawk-mods/tasktune',
    );
    assert.equal(changelogPath(amr), '/changelog/members/amrmscll');
  });
});
