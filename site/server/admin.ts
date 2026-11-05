import type { SettingKey } from '../app/settings.ts';
import type { Bus } from './bus.ts';
import type { Database } from './db.ts';
import type { Sessions } from './sessions.ts';
import type { Settings } from './settings.ts';

export interface ErrorRow {
  fingerprint: string;
  message: string;
  route: string | null;
  requestId: string | null;
  count: number;
  firstAt: string;
  lastAt: string;
  resolvedAt: string | null;
}

export function createAdmin(db: Database, bus: Bus, settings: Settings, sessions: Sessions) {
  return {
    setSetting: settings.set,
    resetSetting: settings.reset,
    revertSetting: settings.revert,
    history: (key: SettingKey) => settings.history(key),

    errors(): ErrorRow[] {
      return db
        .prepare(
          `SELECT fingerprint, message, route, request_id, count, first_at, last_at, resolved_at
             FROM errors ORDER BY resolved_at IS NOT NULL, last_at DESC LIMIT 100`,
        )
        .all()
        .map((row) => ({
          fingerprint: row.fingerprint as string,
          message: row.message as string,
          route: row.route as string | null,
          requestId: row.request_id as string | null,
          count: row.count as number,
          firstAt: row.first_at as string,
          lastAt: row.last_at as string,
          resolvedAt: row.resolved_at as string | null,
        }));
    },

    async resolveError(fingerprint: string, by: string) {
      const at = new Date().toISOString();
      db.prepare('UPDATE errors SET resolved_at = ? WHERE fingerprint = ?').run(at, fingerprint);
      await bus.publish({
        topic: 'errors',
        kind: 'resolved',
        public: false,
        actor: by,
        summary: `Error ${fingerprint} resolved`,
        detail: { fingerprint },
        at,
      });
    },

    async signOutEveryone(by: string) {
      const removed = await sessions.revokeEveryone();
      await bus.record({
        topic: 'console',
        kind: 'sessions',
        public: false,
        actor: by,
        summary: `Everyone signed out: ${removed} sessions ended`,
        detail: { removed },
        at: new Date().toISOString(),
      });
      return removed;
    },
  };
}

export type Admin = ReturnType<typeof createAdmin>;
