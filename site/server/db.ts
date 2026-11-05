import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const migrations = new URL('./migrations/', import.meta.url);

export type Database = DatabaseSync;

export function openDatabase(file: string) {
  if (file !== ':memory:') {
    mkdirSync(path.dirname(file), { recursive: true });
  }
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  db.exec(
    'CREATE TABLE IF NOT EXISTS migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)',
  );
  const applied = new Set(
    db
      .prepare('SELECT name FROM migrations')
      .all()
      .map((row) => row.name as string),
  );
  for (const name of readdirSync(migrations)
    .filter((file) => file.endsWith('.sql'))
    .sort()) {
    if (!applied.has(name)) {
      transaction(db, () => {
        db.exec(readFileSync(new URL(name, migrations), 'utf8'));
        db.prepare('INSERT INTO migrations (name, applied_at) VALUES (?, ?)').run(
          name,
          new Date().toISOString(),
        );
      });
    }
  }
  return db;
}

export function transaction<T>(db: Database, work: () => T) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = work();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function json<T>(value: unknown) {
  return JSON.parse(value as string) as T;
}
