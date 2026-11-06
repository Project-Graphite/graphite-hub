import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createJobs } from './jobs.ts';
import { memoryDatabase } from './testing.ts';

describe('jobs', () => {
  it('runs what is due, keeps retrying failures and gives up after five attempts', async () => {
    const db = memoryDatabase();
    const ran: string[] = [];
    const errors: unknown[] = [];
    const jobs = createJobs(
      db,
      {
        ok: async (ref) => {
          ran.push(ref);
        },
        bad: async () => {
          throw new Error('nope');
        },
      },
      (error) => errors.push(error),
    );
    jobs.add('ok', 'a', '2026-01-01T00:00:00.000Z');
    jobs.add('ok', 'a', '2026-01-02T00:00:00.000Z');
    jobs.add('bad', 'b', '2026-01-01T00:00:00.000Z');
    jobs.add('ok', 'later', '2026-03-01T00:00:00.000Z');
    const now = Date.parse('2026-01-03T00:00:00.000Z');
    assert.deepEqual(await jobs.runDue(now), ['ok:a']);
    assert.deepEqual(ran, ['a']);
    assert.equal(errors.length, 1);
    assert.equal(jobs.pending('ok', 'later'), true);
    for (let attempt = 0; attempt < 6; attempt += 1) {
      await jobs.runDue(now);
    }
    assert.equal(errors.length, 5);
    assert.equal(
      db.prepare("SELECT last_error FROM jobs WHERE ref = 'b'").get()!.last_error,
      'nope',
    );
    jobs.stop();
  });

  it('is re-read from SQLite by a fresh executor', async () => {
    const db = memoryDatabase();
    const first = createJobs(db, {}, () => {});
    first.add('publish', 'p1', '2026-01-01T00:00:00.000Z');
    first.stop();
    const ran: string[] = [];
    const second = createJobs(
      db,
      {
        publish: async (ref) => {
          ran.push(ref);
        },
      },
      () => {},
    );
    await second.runDue(Date.parse('2026-01-01T00:00:01.000Z'));
    assert.deepEqual(ran, ['p1']);
    second.cancel('publish', 'p1');
    assert.equal(second.pending('publish', 'p1'), false);
    second.stop();
  });
});
