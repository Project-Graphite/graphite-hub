import { createHmac } from 'node:crypto';
import type { Message } from '../app/types.ts';
import type { Bus } from './bus.ts';
import type { Database } from './db.ts';

export const MESSAGE_LIMIT = 1000;
export const NAME_LIMIT = 60;

export interface Leaving {
  name: string;
  body: string;
  public: boolean;
  trap: string;
  address: string;
}

export type Left = { ok: true } | { ok: false; reason: string };

function toMessage(row: Record<string, unknown>): Message {
  return {
    id: row.id as number,
    name: row.name as string | null,
    body: row.body as string,
    public: row.public === 1,
    publishedBy: row.published_by as string | null,
    publishedAt: row.published_at as string | null,
    at: row.at as string,
  };
}

export function createMessages(
  db: Database,
  bus: Bus,
  allow: (address: string) => Promise<boolean>,
  secret: string,
) {
  async function changed(summary: string, isPublic: boolean, at: string) {
    await bus.publish({
      topic: 'messages',
      kind: 'message',
      public: isPublic,
      summary,
      detail: {},
      at,
    });
  }

  return {
    wall(limit: number): Message[] {
      return db
        .prepare(
          'SELECT * FROM messages WHERE published_at IS NOT NULL ORDER BY published_at DESC LIMIT ?',
        )
        .all(limit)
        .map(toMessage);
    },

    queue(): Message[] {
      return db
        .prepare('SELECT * FROM messages WHERE published_at IS NULL ORDER BY at DESC LIMIT 200')
        .all()
        .map(toMessage);
    },

    async leave(leaving: Leaving): Promise<Left> {
      const body = leaving.body.trim();
      const name = leaving.name.trim();
      if (leaving.trap) {
        return { ok: true };
      }
      if (!body || body.length > MESSAGE_LIMIT) {
        return { ok: false, reason: `Write between 1 and ${MESSAGE_LIMIT} characters.` };
      }
      if (name.length > NAME_LIMIT) {
        return { ok: false, reason: `Keep the name under ${NAME_LIMIT} characters.` };
      }
      if (!(await allow(leaving.address))) {
        return { ok: false, reason: 'That is three messages this hour; try again later.' };
      }
      const at = new Date().toISOString();
      db.prepare(
        'INSERT INTO messages (name, body, public, address_hash, at) VALUES (?, ?, ?, ?, ?)',
      ).run(
        name || null,
        body,
        leaving.public ? 1 : 0,
        createHmac('sha256', secret).update(leaving.address).digest('hex'),
        at,
      );
      await changed('A message is waiting', false, at);
      return { ok: true };
    },

    async publish(id: number, by: string) {
      const at = new Date().toISOString();
      const { changes } = db
        .prepare(
          'UPDATE messages SET published_by = ?, published_at = ? WHERE id = ? AND public = 1 AND published_at IS NULL',
        )
        .run(by, at, id);
      if (changes > 0) {
        await changed('A message was published', true, at);
      }
      return changes > 0;
    },

    async unpublish(id: number) {
      db.prepare('UPDATE messages SET published_by = NULL, published_at = NULL WHERE id = ?').run(
        id,
      );
      await changed('A message was taken off the wall', true, new Date().toISOString());
    },

    async remove(id: number) {
      db.prepare('DELETE FROM messages WHERE id = ?').run(id);
      await changed('A message was deleted', true, new Date().toISOString());
    },
  };
}

export type Messages = ReturnType<typeof createMessages>;
