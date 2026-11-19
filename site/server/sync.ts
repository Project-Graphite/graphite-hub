import type { Bus } from './bus.ts';
import { importChangelog, recordRelease, syncReleases, type GitHubRelease } from './changelog.ts';
import { config } from './config.ts';
import type { Database } from './db.ts';
import type { Capture } from './errors.ts';
import { readProjects } from './projects.ts';
import { dispatchPlatformSync, syncRegistry } from './registry.ts';
import { syncMembers, syncStats } from './readers.ts';
import type { Sessions } from './sessions.ts';

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

export function coalesced(run: () => Promise<void>) {
  let running: Promise<void> | undefined;
  let queued: Promise<void> | undefined;
  return function next(): Promise<void> {
    if (!running) {
      running = run().finally(() => {
        running = undefined;
      });
      return running;
    }
    queued ??= running
      .catch(() => undefined)
      .then(() => {
        queued = undefined;
        return next();
      });
    return queued;
  };
}

export function createSync(db: Database, bus: Bus, sessions: Sessions, capture: Capture) {
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

  const registry = coalesced(async () => {
    await syncRegistry(db, bus);
    await importChangelog(db, bus, readProjects(db));
  });

  const repos = () => [...new Set(readProjects(db).map((project) => project.repo))];

  async function stats(repo: string) {
    if (repos().some((known) => known.toLowerCase() === repo.toLowerCase())) {
      await syncStats(db, bus, [repo]);
    }
  }

  return {
    async full() {
      for (const [name, step] of [
        ['registry', registry],
        ['members', members],
        ['stats', () => syncStats(db, bus, repos())],
        ['releases', () => syncReleases(db, bus, readProjects(db))],
      ] as const) {
        try {
          await step();
        } catch (error) {
          capture(error, { route: `sync:${name}` });
        }
      }
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
          readProjects(db),
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
