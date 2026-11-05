import { defaults, isSettingKey, problem, type SettingKey, type Values } from '../app/settings.ts';
import type { Bus } from './bus.ts';
import { json, transaction, type Database } from './db.ts';

export class SettingRefused extends Error {}

export interface SettingVersion {
  id: number;
  key: string;
  value: unknown;
  by: string;
  at: string;
}

export function createSettings(db: Database, bus: Bus) {
  let current: Values | undefined;
  bus.listen(({ event }) => {
    if (event.topic === 'settings') {
      current = undefined;
    }
  });

  function read(): Values {
    const values = defaults();
    for (const row of db.prepare('SELECT key, value FROM site_settings').all()) {
      const key = row.key as string;
      const value: unknown = json(row.value);
      if (isSettingKey(key) && problem(key, value) === null) {
        Object.assign(values, { [key]: value });
      }
    }
    return values;
  }

  async function write(key: string, value: unknown, by: string) {
    if (!isSettingKey(key)) {
      throw new SettingRefused(`${key} is not a setting.`);
    }
    const refused = problem(key, value);
    if (refused) {
      throw new SettingRefused(refused);
    }
    const at = new Date().toISOString();
    const blob = JSON.stringify(value);
    transaction(db, () => {
      db.prepare(
        `INSERT INTO site_settings (key, value, updated_by, updated_at) VALUES (?, ?, ?, ?)
         ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
      ).run(key, blob, by, at);
      db.prepare(
        "INSERT INTO versions (kind, key, blob, by, at) VALUES ('settings', ?, ?, ?, ?)",
      ).run(key, blob, by, at);
    });
    current = undefined;
    await bus.publish({
      topic: 'settings',
      key: key.split('.')[0],
      kind: 'settings',
      public: true,
      actor: by,
      summary: `${key} changed`,
      detail: { key },
      at,
    });
  }

  return {
    get(): Values {
      current ??= read();
      return current;
    },
    set: write,
    reset(key: SettingKey, by: string) {
      return write(key, defaults()[key], by);
    },
    history(key: SettingKey): SettingVersion[] {
      return db
        .prepare(
          "SELECT id, key, blob, by, at FROM versions WHERE kind = 'settings' AND key = ? ORDER BY id DESC LIMIT 50",
        )
        .all(key)
        .map((row) => ({
          id: row.id as number,
          key: row.key as string,
          value: json(row.blob),
          by: row.by as string,
          at: row.at as string,
        }));
    },
    async revert(id: number, by: string) {
      const row = db
        .prepare("SELECT key, blob FROM versions WHERE kind = 'settings' AND id = ?")
        .get(id);
      if (!row) {
        throw new SettingRefused(`Version ${id} does not exist.`);
      }
      await write(row.key as string, json(row.blob), by);
    },
  };
}

export type Settings = ReturnType<typeof createSettings>;
