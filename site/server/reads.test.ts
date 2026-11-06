import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createModel } from '../app/model.ts';
import type { Directory } from '../app/types.ts';
import { createReads } from './reads.ts';
import { memoryDatabase } from './testing.ts';

describe('reads', () => {
  it('finds the latest lines of the asked kinds behind newer lines of other kinds', () => {
    const db = memoryDatabase();
    const insert = db.prepare(
      'INSERT INTO activity (kind, public, summary, detail, at, seq) VALUES (?, 1, ?, ?, ?, ?)',
    );
    insert.run('deploy', 'strata deployed', '{"project":"strata"}', '2026-11-06T08:00:00Z', '1-0');
    for (let hour = 9; hour < 21; hour++) {
      insert.run(
        'uptime',
        '6 of 7 up',
        '{"up":6,"total":7}',
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
});
