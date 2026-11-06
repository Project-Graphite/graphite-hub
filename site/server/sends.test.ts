import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createJobs } from './jobs.ts';
import type { Outgoing } from './mail.ts';
import { classify, createSends, EMAIL_JOB, EMAIL_QUEUE } from './sends.ts';
import { memoryDatabase } from './testing.ts';

const T0 = Date.parse('2026-11-09T08:00:00.000Z');

function message(to: string): Outgoing {
  return {
    from: { name: 'Project Graphite' },
    replyTo: null,
    to,
    subject: 'hi',
    html: '<p>hi</p>',
    text: 'hi',
    unsubscribeUrl: null,
  };
}

function setup(deliver: (message: Outgoing) => Promise<string>, perHour = 20) {
  const db = memoryDatabase();
  for (const id of ['s1', 's2', 's3']) {
    db.prepare(
      "INSERT INTO subscribers (id, email, token, confirmed_at, created_at, updated_at) VALUES (?, ?, 't', '2026-01-01', '2026-01-01', '2026-01-01')",
    ).run(id, `${id}@example.com`);
  }
  const jobs = createJobs(db, {}, () => {});
  const bounced: string[] = [];
  const sends = createSends(db, jobs, {
    deliver,
    compose: async (send) =>
      send.ref === 'skip' ? null : message(`${send.subscriber}@example.com`),
    perHour: () => perHour,
    bounced: (subscriber) => bounced.push(subscriber),
  });
  return { db, jobs, sends, bounced };
}

describe('send classification', () => {
  it('tells a recipient rejection from a temporary failure', () => {
    assert.deepEqual(classify({ code: 'EENVELOPE', responseCode: 550, message: 'User unknown' }), {
      bounce: true,
      permanent: true,
      message: 'User unknown',
    });
    assert.equal(classify({ code: 'EENVELOPE', responseCode: 450, message: 'busy' }).bounce, false);
    assert.equal(classify({ code: 'ECONNECTION', message: 'refused' }).permanent, false);
    assert.equal(classify({ code: 'EMESSAGE', responseCode: 552 }).permanent, true);
    assert.equal(classify({ code: 'EMESSAGE', responseCode: 552 }).bounce, false);
  });
});

describe('sends', () => {
  it('sends what is due, records the message id and finishes the job', async () => {
    const delivered: string[] = [];
    const { db, jobs, sends } = setup(async (message) => {
      delivered.push(message.to);
      return `<${message.to}>`;
    });
    sends.queue('s1', 'post', 'p1', '2026-11-09T07:00:00.000Z');
    sends.queue('s2', 'post', 'p1', '2026-11-09T09:00:00.000Z');
    assert.equal(sends.queue('s1', 'post', 'p1', '2026-11-09T07:00:00.000Z'), false);

    assert.deepEqual(await sends.drain(T0), { sent: 1, failed: 0, bounced: 0, deferred: 0 });

    assert.deepEqual(delivered, ['s1@example.com']);
    const sent = db.prepare("SELECT status, message_id FROM sends WHERE subscriber = 's1'").get()!;
    assert.equal(sent.status, 'sent');
    assert.equal(sent.message_id, '<s1@example.com>');
    assert.equal(jobs.pending(EMAIL_JOB, EMAIL_QUEUE), true);
    assert.equal(
      db.prepare('SELECT due_at FROM jobs WHERE kind = ?').get(EMAIL_JOB)!.due_at,
      '2026-11-09T09:00:00.000Z',
    );
    jobs.stop();
  });

  it('keeps to the hourly budget and comes back in five minutes', async () => {
    const { db, jobs, sends } = setup(async () => 'id', 2);
    for (const id of ['s1', 's2', 's3']) {
      sends.queue(id, 'post', 'p1', '2026-11-09T07:00:00.000Z');
    }
    assert.equal((await sends.drain(T0)).sent, 2);
    assert.equal(db.prepare("SELECT count(*) AS n FROM sends WHERE status = 'queued'").get()!.n, 1);
    assert.equal(
      db.prepare('SELECT due_at FROM jobs WHERE kind = ?').get(EMAIL_JOB)!.due_at,
      '2026-11-09T08:05:00.000Z',
    );
    assert.equal((await sends.drain(T0 + 5 * 60_000)).sent, 0);
    assert.equal((await sends.drain(T0 + 61 * 60_000)).sent, 1);
    jobs.stop();
  });

  it('records a rejected address as a bounce and suppresses it through the callback', async () => {
    const { db, jobs, sends, bounced } = setup(async () => {
      throw Object.assign(new Error('550 5.1.1 User unknown'), {
        code: 'EENVELOPE',
        responseCode: 550,
      });
    });
    sends.queue('s1', 'post', 'p1', '2026-11-09T07:00:00.000Z');
    assert.deepEqual(await sends.drain(T0), { sent: 0, failed: 0, bounced: 1, deferred: 0 });
    const row = db.prepare("SELECT status, error FROM sends WHERE subscriber = 's1'").get()!;
    assert.equal(row.status, 'bounced');
    assert.match(row.error as string, /User unknown/);
    assert.deepEqual(bounced, ['s1']);
    jobs.stop();
  });

  it('retries temporary failures with backoff and gives up after five', async () => {
    let calls = 0;
    const { db, jobs, sends } = setup(async () => {
      calls += 1;
      throw Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNECTION' });
    });
    sends.queue('s1', 'confirm', null, '2026-11-09T07:00:00.000Z');
    assert.equal((await sends.drain(T0)).deferred, 1);
    assert.equal(db.prepare('SELECT due_at FROM sends').get()!.due_at, '2026-11-09T08:05:00.000Z');
    assert.equal((await sends.drain(T0)).deferred, 0);
    let at = T0;
    for (let attempt = 2; attempt <= 5; attempt += 1) {
      at += 2 * 60 * 60_000;
      await sends.drain(at);
    }
    assert.equal(calls, 5);
    assert.equal(db.prepare('SELECT status FROM sends').get()!.status, 'failed');
    jobs.stop();
  });

  it('fails a send that has nothing left to say', async () => {
    const { db, jobs, sends } = setup(async () => 'id');
    sends.queue('s1', 'post', 'skip', '2026-11-09T07:00:00.000Z');
    assert.equal((await sends.drain(T0)).failed, 1);
    assert.equal(db.prepare('SELECT error FROM sends').get()!.error, 'nothing to send');
    jobs.stop();
  });
});
