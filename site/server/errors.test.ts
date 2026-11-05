import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createErrors, fingerprint } from './errors.ts';
import { memoryDatabase, recordingBus } from './testing.ts';

const stack = (line: number) =>
  `Error: boom\n    at load (/app/server/registry.ts:${line}:7)\n    at run (/app/server/main.ts:3:1)`;

describe('fingerprint', () => {
  it('ignores numbers, ids and line positions', () => {
    assert.equal(
      fingerprint('Project 12 failed after 300 ms', stack(10)),
      fingerprint('Project 7 failed after 41 ms', stack(99)),
    );
    assert.equal(
      fingerprint('Delivery 0f8f6e4a-1111-2222-3333-444455556666 failed', null),
      fingerprint('Delivery 9a9a9a9a-aaaa-bbbb-cccc-ddddeeeeffff failed', null),
    );
  });

  it('separates different messages and different top frames', () => {
    assert.notEqual(fingerprint('boom', stack(1)), fingerprint('bang', stack(1)));
    assert.notEqual(
      fingerprint('boom', stack(1)),
      fingerprint('boom', 'Error: boom\n    at other (/app/server/sync.ts:1:1)'),
    );
  });
});

describe('capture', () => {
  async function setup() {
    const db = memoryDatabase();
    const alerts: string[] = [];
    const capture = createErrors(db, recordingBus().bus, async (subject) => {
      alerts.push(subject);
      return true;
    });
    return { db, alerts, capture };
  }

  const settle = () => new Promise((resolve) => setImmediate(resolve));

  it('groups repeats under one fingerprint and alerts the owner once', async () => {
    const { db, alerts, capture } = await setup();
    capture(new Error('Registry fetch failed for 3 files'), { route: '/', requestId: 'r1' });
    await settle();
    capture(new Error('Registry fetch failed for 5 files'), { route: '/', requestId: 'r2' });
    await settle();

    const rows = db.prepare('SELECT count, request_id, alerted_at FROM errors').all();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].count, 2);
    assert.equal(rows[0].request_id, 'r2');
    assert.ok(rows[0].alerted_at);
    assert.equal(alerts.length, 1);
  });

  it('alerts again for a resolved error only after a quiet day', async () => {
    const { db, alerts, capture } = await setup();
    capture(new Error('boom'));
    await settle();
    db.prepare("UPDATE errors SET resolved_at = '2026-11-01T00:00:00.000Z'").run();
    capture(new Error('boom'));
    await settle();
    assert.equal(alerts.length, 1);

    db.prepare(
      "UPDATE errors SET resolved_at = '2026-11-01T00:00:00.000Z', alerted_at = '2026-01-01T00:00:00.000Z'",
    ).run();
    capture(new Error('boom'));
    await settle();
    assert.equal(alerts.length, 2);
  });
});
