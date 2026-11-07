import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createJobs, retryAt } from './jobs.ts';
import { memoryDatabase } from './testing.ts';

const MINUTE = 60_000;

describe('jobs', () => {
  it('runs what is due, retries failures with a growing wait and gives up after eight attempts', async () => {
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
    const row = () => db.prepare("SELECT due_at, last_error FROM jobs WHERE ref = 'b'").get()!;
    assert.deepEqual({ ...row() }, { due_at: retryAt(1, now), last_error: 'nope' });
    assert.equal(retryAt(1, now), new Date(now + MINUTE).toISOString());
    assert.equal(retryAt(4, now), new Date(now + 8 * MINUTE).toISOString());
    assert.equal(retryAt(7, now), new Date(now + 60 * MINUTE).toISOString());
    await jobs.runDue(now + MINUTE - 1);
    assert.equal(errors.length, 1);
    for (let attempt = 2; attempt <= 9; attempt += 1) {
      await jobs.runDue(Date.parse(row().due_at as string));
    }
    assert.equal(errors.length, 8);
    assert.equal(jobs.pending('bad', 'b'), true);
    jobs.stop();
  });

  it('keeps the row of a job that cancels itself while it runs, so the outcome is recorded', async () => {
    const db = memoryDatabase();
    const jobs = createJobs(
      db,
      {
        publish: async (ref) => {
          jobs.cancel('publish', ref);
          throw new Error('the bus is down');
        },
      },
      () => {},
    );
    jobs.add('publish', 'p1', '2026-01-01T00:00:00.000Z');
    const now = Date.parse('2026-01-01T00:00:01.000Z');
    await jobs.runDue(now);
    assert.deepEqual(
      db
        .prepare('SELECT attempts, due_at, last_error FROM jobs')
        .all()
        .map((row) => ({ ...row })),
      [{ attempts: 1, due_at: retryAt(1, now), last_error: 'the bus is down' }],
    );
    jobs.stop();
  });

  it('lets a running job arm its own next run without losing either row', async () => {
    const db = memoryDatabase();
    const jobs = createJobs(
      db,
      {
        digest: async () => {
          jobs.add('digest', 'weekly', '2026-01-08T00:00:00.000Z');
        },
      },
      () => {},
    );
    jobs.add('digest', 'weekly', '2026-01-01T00:00:00.000Z');
    assert.deepEqual(await jobs.runDue(Date.parse('2026-01-01T00:00:01.000Z')), ['digest:weekly']);
    assert.deepEqual(
      db
        .prepare('SELECT due_at, done_at IS NOT NULL AS done FROM jobs ORDER BY id')
        .all()
        .map((row) => [row.due_at, row.done]),
      [
        ['2026-01-01T00:00:00.000Z', 1],
        ['2026-01-08T00:00:00.000Z', 0],
      ],
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
