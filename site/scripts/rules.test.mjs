import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  classify,
  compareVersions,
  concernsSibling,
  isVersion,
  nextVersion,
  parseTag,
  tagsFor,
} from './rules.mjs';

describe('classify', () => {
  it('maps conventional types to changelog sections', () => {
    assert.deepEqual(classify('feat: add reading sources'), {
      type: 'added',
      text: 'Add reading sources',
      pr: null,
    });
    assert.equal(classify('fix(server): keep cached pages').type, 'fixed');
    assert.equal(classify('perf: index catalogue lookups').type, 'changed');
    assert.equal(classify('style: raise faint text contrast').type, 'changed');
    assert.equal(classify('revert: restore the old favicon').type, 'changed');
  });

  it('skips maintenance commits and merges', () => {
    for (const message of [
      'chore: sync registry from platform@47d8f61',
      'chore(deps): bump react-router from 7.18.4 to 8.4.0',
      'docs: describe the index',
      'ci: cache npm',
      'test: cover the inbox',
      'build: pin node',
      'refactor: extract the poster',
      'Merge pull request #12 from project-graphite/feature',
      "Merge branch 'main' into feature",
    ]) {
      assert.equal(classify(message), null, message);
    }
  });

  it('marks breaking changes from the bang or the footer, whatever the type', () => {
    assert.equal(classify('feat!: require node 24').type, 'breaking');
    assert.equal(classify('chore(api)!: drop the v1 routes').type, 'breaking');
    assert.equal(
      classify('feat: rename the export\n\nBREAKING CHANGE: the old path is gone').type,
      'breaking',
    );
  });

  it('files security-scoped fixes under security', () => {
    assert.equal(classify('fix(security): escape review markdown').type, 'security');
    assert.equal(classify('security: rotate the session secret').type, 'security');
  });

  it('extracts a squash-merge pull request number', () => {
    assert.deepEqual(classify('fix: list epics on the member page (#5)'), {
      type: 'fixed',
      text: 'List epics on the member page',
      pr: 5,
    });
  });

  it('classifies free-form subjects by their leading verb', () => {
    assert.equal(classify('Add configurable site-wide default catalog sources').type, 'added');
    assert.equal(classify('remove traceboard from the hub').type, 'removed');
    assert.equal(classify('Fixed the launcher delay').type, 'fixed');
    assert.deepEqual(classify('Update stack-switch.wh.cpp'), {
      type: 'changed',
      text: 'Update stack-switch.wh.cpp',
      pr: null,
    });
  });
});

describe('concernsSibling', () => {
  const siblings = ['stack-switch'];

  it('leaves out commits that only name another project in the epic', () => {
    assert.equal(concernsSibling('Update stack-switch.wh.cpp', 'tasktune', siblings), true);
    assert.equal(concernsSibling('fix(stack-switch): keep delays', 'tasktune', siblings), true);
  });

  it('keeps commits that name this project or no project at all', () => {
    assert.equal(
      concernsSibling('feat: share the stack-switch launcher with tasktune', 'tasktune', siblings),
      false,
    );
    assert.equal(
      concernsSibling('fix: reload settings on the taskbar thread', 'tasktune', siblings),
      false,
    );
    assert.equal(concernsSibling('feat: stack-switching hotkeys', 'tasktune', siblings), false);
  });
});

describe('parseTag', () => {
  it('reads repository and child project tags', () => {
    assert.deepEqual(parseTag('v1.4.0'), { slug: null, version: '1.4.0' });
    assert.deepEqual(parseTag('stack-switch/v0.2.0-rc.1'), {
      slug: 'stack-switch',
      version: '0.2.0-rc.1',
    });
  });

  it('ignores tags that are not versions', () => {
    for (const tag of ['1.4.0', 'v1.4', 'release-2026', 'Stack/v1.0.0', 'v1.0.0/extra']) {
      assert.equal(parseTag(tag), null, tag);
    }
  });

  it('validates bare versions', () => {
    assert.equal(isVersion('2.0.0'), true);
    assert.equal(isVersion('v2.0.0'), false);
    assert.equal(isVersion(2), false);
  });
});

describe('compareVersions', () => {
  it('orders by semantic version precedence', () => {
    const ordered = [
      '0.9.0',
      '1.0.0-alpha',
      '1.0.0-alpha.1',
      '1.0.0-alpha.beta',
      '1.0.0-beta.2',
      '1.0.0-beta.11',
      '1.0.0-rc.1',
      '1.0.0',
      '1.2.0',
      '1.10.0',
    ];
    assert.deepEqual([...ordered].reverse().sort(compareVersions), ordered);
  });
});

describe('nextVersion', () => {
  it('starts a project with no versions at 0.1.0', () => {
    assert.equal(nextVersion(null, ['fixed']), '0.1.0');
  });

  it('bumps the minor version for added or removed features', () => {
    assert.equal(nextVersion('1.4.0', ['fixed', 'added']), '1.5.0');
    assert.equal(nextVersion('1.4.2', ['removed']), '1.5.0');
  });

  it('bumps the patch version for fixes and other changes', () => {
    assert.equal(nextVersion('1.4.0', ['fixed', 'changed', 'security']), '1.4.1');
  });

  it('bumps the major version for breaking changes from 1.0.0 onwards', () => {
    assert.equal(nextVersion('2.3.1', ['breaking', 'added']), '3.0.0');
    assert.equal(nextVersion('0.3.0', ['breaking']), '0.4.0');
  });

  it('releases the pending version after a prerelease', () => {
    assert.equal(nextVersion('1.0.0-rc.2', ['fixed']), '1.0.0');
  });
});

describe('tagsFor', () => {
  it('accepts a bare tag only for a repository top-level entry', () => {
    assert.deepEqual(tagsFor({ slug: 'graphite-tracker', parent: null }, '1.0.0'), [
      'v1.0.0',
      'graphite-tracker/v1.0.0',
    ]);
    assert.deepEqual(tagsFor({ slug: 'tasktune', parent: 'windhawk-mods' }, '1.0.0'), [
      'tasktune/v1.0.0',
    ]);
  });
});
