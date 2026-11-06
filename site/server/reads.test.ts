import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
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
});
