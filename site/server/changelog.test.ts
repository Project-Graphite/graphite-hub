import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { groupNotes, importChangelog, projectForTag, recordRelease } from './changelog.ts';
import type { RegistryEntry } from './registry.ts';
import { memoryDatabase, recordingBus } from './testing.ts';

const entry = (slug: string, repo: string, parent?: string): RegistryEntry => ({
  slug,
  parent,
  kind: 'project',
  name: slug,
  summary: 'A project summary long enough to pass.',
  repo,
  owner: 'amrmscll',
  authors: ['AmrMsCLL'],
  status: 'live',
  deploy: { kind: 'none' },
});

const entries = [
  entry('strata', 'project-graphite/strata'),
  entry('windhawk-mods', 'project-graphite/windhawk-mods'),
  entry('tasktune', 'project-graphite/windhawk-mods', 'windhawk-mods'),
];

const notes = [
  "## What's Changed",
  '* feat: shared boards by @AmrMsCLL in https://github.com/project-graphite/strata/pull/41',
  '* fix(agenda): keep the week in view by @BluoCaroot in https://github.com/project-graphite/strata/pull/42',
  '* chore: bump deps by @dependabot in https://github.com/project-graphite/strata/pull/43',
  '',
  '**Full Changelog**: https://github.com/project-graphite/strata/compare/v1.1.0...v1.2.0',
].join('\n');

describe('groupNotes', () => {
  it('classifies generated release notes into change groups', () => {
    assert.deepEqual(groupNotes(notes), [
      {
        type: 'added',
        changes: [{ text: 'Shared boards', commit: null, pr: 41, author: 'AmrMsCLL' }],
      },
      {
        type: 'fixed',
        changes: [{ text: 'Keep the week in view', commit: null, pr: 42, author: 'BluoCaroot' }],
      },
    ]);
  });
});

describe('projectForTag', () => {
  it('maps a plain tag to the top-level project and a prefixed tag to the child', () => {
    assert.equal(
      projectForTag(entries, 'Project-Graphite/strata', 'v1.2.0')?.project.slug,
      'strata',
    );
    assert.equal(
      projectForTag(entries, 'project-graphite/windhawk-mods', 'v2.0.0')?.project.slug,
      'windhawk-mods',
    );
    assert.equal(
      projectForTag(entries, 'project-graphite/windhawk-mods', 'tasktune/v1.1.0')?.version,
      '1.1.0',
    );
    assert.equal(projectForTag(entries, 'project-graphite/strata', 'nightly'), undefined);
  });
});

describe('changelog', () => {
  it('starts every project at 1.0.0 once, then records published releases after the import', async () => {
    const db = memoryDatabase();
    const { bus, recorded } = recordingBus();
    await importChangelog(db, bus, entries);
    await importChangelog(db, bus, entries);
    assert.equal(
      db.prepare("SELECT count(*) AS n FROM releases WHERE version = '1.0.0'").get()?.n,
      3,
    );

    const later = new Date(Date.now() + 60_000).toISOString();
    const release = {
      tag_name: 'v1.2.0',
      name: 'v1.2.0',
      body: notes,
      draft: false,
      prerelease: false,
      published_at: later,
    };
    await recordRelease(db, bus, entries, 'project-graphite/strata', release);
    await recordRelease(db, bus, entries, 'project-graphite/strata', release);
    await recordRelease(db, bus, entries, 'project-graphite/strata', {
      ...release,
      tag_name: 'v0.9.0',
      published_at: '2020-01-01T00:00:00Z',
    });

    const rows = db
      .prepare(
        "SELECT version, title, groups FROM releases WHERE project = 'strata' ORDER BY version",
      )
      .all();
    assert.deepEqual(
      rows.map((row) => row.version),
      ['1.0.0', '1.2.0'],
    );
    assert.equal(rows[1].title, null);
    assert.equal(recorded.filter((event) => event.kind === 'release').length, 1);
  });
});
