import type { Bus } from './bus.ts';
import { config } from './config.ts';
import { transaction, type Database } from './db.ts';
import { github, paginate } from './github.ts';

interface GitHubUser {
  login: string;
  name: string | null;
  avatar_url: string;
  public_repos: number;
  followers: number;
  created_at: string;
}

interface GitHubRepository {
  full_name: string;
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  pushed_at: string | null;
}

export async function syncMembers(db: Database, bus: Bus) {
  const [listed, admins] = await Promise.all([
    paginate<{ login: string }>(`/orgs/${config.organisation}/members`),
    paginate<{ login: string }>(`/orgs/${config.organisation}/members?role=admin`),
  ]);
  const owners = new Set(admins.map((admin) => admin.login));
  const users = await Promise.all(
    listed.map((member) => github<GitHubUser>(`/users/${member.login}`)),
  );
  const now = new Date().toISOString();
  const fields = 'login, name, avatar_url, role, public_repos, followers, github_since';
  const before = JSON.stringify(db.prepare(`SELECT ${fields} FROM members ORDER BY handle`).all());
  const current = new Set(users.map((user) => user.login.toLowerCase()));
  const removed = db
    .prepare('SELECT handle, login FROM members')
    .all()
    .filter((row) => !current.has(row.handle as string))
    .map((row) => row.login as string);

  transaction(db, () => {
    const upsert = db.prepare(
      `INSERT INTO members (handle, ${fields}, joined_at, synced_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (handle) DO UPDATE SET login = excluded.login, name = excluded.name,
         avatar_url = excluded.avatar_url, role = excluded.role, public_repos = excluded.public_repos,
         followers = excluded.followers, github_since = excluded.github_since, synced_at = excluded.synced_at`,
    );
    for (const user of users) {
      upsert.run(
        user.login.toLowerCase(),
        user.login,
        user.name?.trim() || user.login,
        user.avatar_url,
        owners.has(user.login) ? 'owner' : 'member',
        user.public_repos,
        user.followers,
        user.created_at.slice(0, 4),
        now,
        now,
      );
    }
    const remove = db.prepare('DELETE FROM members WHERE login = ?');
    for (const login of removed) {
      remove.run(login);
    }
  });

  if (
    JSON.stringify(db.prepare(`SELECT ${fields} FROM members ORDER BY handle`).all()) !== before
  ) {
    await bus.publish({
      topic: 'members',
      kind: 'members',
      public: true,
      summary: `Members synced: ${users.length} in the organisation`,
      detail: { removed: removed.length },
      at: now,
    });
  }
  return removed;
}

export async function syncStats(db: Database, bus: Bus, repos: string[]) {
  const now = new Date().toISOString();
  const previous = new Map(
    db
      .prepare('SELECT repo, stars, forks, open_issues, pushed_at, languages FROM repo_stats')
      .all()
      .map((row) => [row.repo as string, row]),
  );
  const upsert = db.prepare(
    `INSERT INTO repo_stats (repo, stars, forks, open_issues, pushed_at, languages, synced_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (repo) DO UPDATE SET stars = excluded.stars, forks = excluded.forks,
       open_issues = excluded.open_issues, pushed_at = excluded.pushed_at,
       languages = excluded.languages, synced_at = excluded.synced_at`,
  );
  const stars: Record<string, number> = {};
  for (const repo of repos) {
    const [details, languages] = await Promise.all([
      github<GitHubRepository>(`/repos/${repo}`),
      github<Record<string, number>>(`/repos/${repo}/languages`),
    ]);
    const key = repo.toLowerCase();
    const row = {
      repo: key,
      stars: details.stargazers_count,
      forks: details.forks_count,
      open_issues: details.open_issues_count,
      pushed_at: details.pushed_at,
      languages: JSON.stringify(languages),
    };
    const before = previous.get(key);
    if (JSON.stringify(before) === JSON.stringify(row)) {
      continue;
    }
    upsert.run(key, row.stars, row.forks, row.open_issues, row.pushed_at, row.languages, now);
    if (before && before.stars !== row.stars) {
      stars[key] = row.stars - (before.stars as number);
    }
    await bus.publish({
      topic: 'stats',
      key,
      kind: 'stats',
      public: true,
      summary: `${repo} stats changed`,
      detail: { stars: row.stars, forks: row.forks },
      at: now,
    });
  }
  if (Object.keys(stars).length > 0) {
    await bus.record({
      topic: 'stats',
      kind: 'sync',
      public: true,
      summary: `Stars changed on ${Object.keys(stars).length} repositories`,
      detail: { stars },
      at: now,
    });
  }
}
