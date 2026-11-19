import type { Bus } from './bus.ts';
import { config } from './config.ts';
import { transaction, type Database } from './db.ts';
import { github, paginate } from './github.ts';
import { firstName } from './profiles.ts';
import { readProjects } from './projects.ts';

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
  const state = () =>
    JSON.stringify(db.prepare(`SELECT ${fields}, left_at FROM members ORDER BY handle`).all());
  const before = state();
  const current = new Set(users.map((user) => user.login.toLowerCase()));
  const known = db.prepare('SELECT handle, login, left_at FROM members').all();
  const here = new Set(
    known.filter((row) => row.left_at === null).map((row) => row.handle as string),
  );
  const left = known
    .filter((row) => here.has(row.handle as string) && !current.has(row.handle as string))
    .map((row) => row.login as string);

  transaction(db, () => {
    const upsert = db.prepare(
      `INSERT INTO members (handle, ${fields}, joined_at, synced_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (handle) DO UPDATE SET login = excluded.login, name = excluded.name,
         avatar_url = excluded.avatar_url, role = excluded.role, public_repos = excluded.public_repos,
         followers = excluded.followers, github_since = excluded.github_since, synced_at = excluded.synced_at,
         left_at = NULL`,
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
    const leave = db.prepare('UPDATE members SET left_at = ? WHERE login = ?');
    for (const login of left) {
      leave.run(now, login);
    }
  });

  if (state() !== before) {
    await bus.publish({
      topic: 'members',
      kind: 'members',
      public: true,
      summary: `Members synced: ${users.length} in the organisation`,
      detail: { left: left.length },
      at: now,
    });
  }
  if (known.length > 0) {
    for (const row of db
      .prepare(
        `SELECT m.handle, coalesce(p.name, m.name) AS name FROM members m LEFT JOIN profiles p USING (handle)
          WHERE m.left_at IS NULL AND coalesce(p.listed, 1) = 1 ORDER BY m.handle`,
      )
      .all()
      .filter((member) => !here.has(member.handle as string))) {
      await bus.record({
        topic: 'members',
        key: row.handle as string,
        kind: 'member',
        public: true,
        summary: `${firstName(row.name as string)} joined`,
        detail: { member: row.handle as string, change: 'joined' },
        at: now,
      });
    }
  }
  return left;
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
  const projects = readProjects(db).filter((project) => project.listed);
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
    await bus.publish({
      topic: 'stats',
      key,
      kind: 'stats',
      public: true,
      summary: `${repo} stats changed`,
      detail: { stars: row.stars, forks: row.forks },
      at: now,
    });
    const inRepo = projects.filter((project) => project.repo.toLowerCase() === key);
    const project = inRepo.find((candidate) => !candidate.parent) ?? inRepo[0];
    if (project && before && row.stars > (before.stars as number)) {
      await bus.record({
        topic: 'stats',
        key: project.slug,
        kind: 'star',
        public: true,
        summary: `${project.name} reached ${row.stars} ${row.stars === 1 ? 'star' : 'stars'}`,
        detail: { project: project.slug, stars: row.stars },
        at: now,
      });
    }
  }
}
