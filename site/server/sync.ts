import type { Bus } from './bus.ts';
import { importChangelog, recordRelease, syncReleases, type GitHubRelease } from './changelog.ts';
import { config } from './config.ts';
import type { Database } from './db.ts';
import { dispatchPlatformSync, storedEntries, syncRegistry } from './registry.ts';
import { syncMembers, syncStats } from './readers.ts';
import type { Sessions } from './sessions.ts';
import { recordUptimeSummary } from './uptime.ts';
import type { Writeback } from './writeback.ts';

interface Push {
  ref: string;
  repository: { full_name: string; default_branch: string };
  commits: { added: string[]; modified: string[]; removed: string[] }[];
}

interface RepositoryEvent {
  repository?: { full_name: string };
}

export function changedFiles(push: Push) {
  return new Set(
    push.commits.flatMap((commit) => [...commit.added, ...commit.modified, ...commit.removed]),
  );
}

export function createSync(db: Database, bus: Bus, sessions: Sessions, writeback: Writeback) {
  async function members() {
    for (const login of await syncMembers(db, bus)) {
      const removed = await sessions.revoke(login);
      await bus.publish({
        topic: 'sessions',
        key: login.toLowerCase(),
        kind: 'revoked',
        public: false,
        summary: `${login} left the organisation`,
        detail: { removed },
        at: new Date().toISOString(),
      });
    }
  }

  async function registry() {
    const entries = await syncRegistry(db, bus);
    await importChangelog(db, bus, entries);
    await writeback.settle(entries);
    return entries;
  }

  async function stats(repo: string) {
    if (storedEntries(db).some((entry) => entry.repo.toLowerCase() === repo.toLowerCase())) {
      await syncStats(db, bus, [repo]);
    }
  }

  return {
    async full() {
      const entries = await registry();
      await members();
      await syncStats(db, bus, [...new Set(entries.map((entry) => entry.repo))]);
      await syncReleases(db, bus, entries);
      await recordUptimeSummary(db, bus);
    },

    async webhook(event: string, payload: unknown) {
      const repo = (payload as RepositoryEvent).repository?.full_name;
      if (event === 'push') {
        const push = payload as Push;
        if (push.ref !== `refs/heads/${push.repository.default_branch}`) {
          return;
        }
        const files = changedFiles(push);
        if (push.repository.full_name.toLowerCase() === config.platformRepo.toLowerCase()) {
          if (
            [...files].some((file) => file.startsWith('projects/') || file.startsWith('schema/'))
          ) {
            await registry();
          }
        } else if (files.has('.graphite.yml')) {
          await dispatchPlatformSync();
        }
        await stats(push.repository.full_name);
      } else if (event === 'release' && repo) {
        await recordRelease(
          db,
          bus,
          storedEntries(db),
          repo,
          (payload as { release: GitHubRelease }).release,
        );
      } else if (['star', 'fork', 'repository'].includes(event) && repo) {
        await stats(repo);
      } else if (['member', 'membership', 'organization'].includes(event)) {
        await members();
      }
    },
  };
}

export type Sync = ReturnType<typeof createSync>;
