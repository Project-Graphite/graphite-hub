import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createMessages } from './messages.ts';
import { memoryDatabase, recordingBus } from './testing.ts';

function setup(allowed = true) {
  const db = memoryDatabase();
  const { bus, published } = recordingBus();
  const messages = createMessages(db, bus, async () => allowed, 'secret');
  const leave = (body: string, extra: Partial<Parameters<typeof messages.leave>[0]> = {}) =>
    messages.leave({ name: '', body, public: true, trap: '', address: '203.0.113.7', ...extra });
  return { db, messages, published, leave };
}

describe('messages', () => {
  it('puts a public message on the wall as soon as it is left', async () => {
    const { messages, leave, published } = setup();
    assert.deepEqual(await leave('  Hello from Cairo  ', { name: 'Mona' }), { ok: true });
    const [onWall] = messages.wall(10);
    assert.equal(onWall.body, 'Hello from Cairo');
    assert.equal(onWall.publishedBy, null);
    assert.equal(messages.queue().length, 0);
    assert.equal(published[0].public, true);

    await messages.unpublish(onWall.id);
    assert.equal(messages.wall(10).length, 0);
    assert.equal(await messages.publish(onWall.id, 'amrmscll'), true);
    assert.equal(messages.wall(10)[0].publishedBy, 'amrmscll');
  });

  it('keeps a private message in the queue and never publishes it', async () => {
    const { messages, leave, published } = setup();
    await leave('only for you', { public: false });
    assert.equal(published[0].public, false);
    assert.equal(await messages.publish(messages.queue()[0].id, 'amrmscll'), false);
    assert.equal(messages.wall(10).length, 0);
  });

  it('refuses empty, long and rate-limited messages, and silently drops the honeypot', async () => {
    assert.equal((await setup().leave('   ')).ok, false);
    assert.equal((await setup().leave('x'.repeat(1001))).ok, false);
    assert.equal((await setup(false).leave('hello')).ok, false);
    const trapped = setup();
    assert.deepEqual(await trapped.leave('buy now', { trap: 'https://spam.example' }), {
      ok: true,
    });
    assert.equal(trapped.messages.queue().length, 0);
  });

  it('stores a keyed hash of the address, never the address', async () => {
    const { db, leave } = setup();
    await leave('hello');
    const row = db.prepare('SELECT address_hash FROM messages').get()!;
    assert.match(row.address_hash as string, /^[0-9a-f]{64}$/);
    assert.ok(!(row.address_hash as string).includes('203.0.113.7'));
  });
});
