import type { ChangeType, ReleaseChange, ReleaseGroup } from '../app/types.ts';
import { CHANGE_TYPES, classify, compareVersions, parseTag } from '../scripts/rules.mjs';
import type { Bus } from './bus.ts';
import { transaction, type Database } from './db.ts';
import { github } from './github.ts';
import type { RegistryEntry } from './registry.ts';

export interface GitHubRelease {
  tag_name: string;
  name: string | null;
  body: string | null;
  draft: boolean;
  prerelease: boolean;
  published_at: string | null;
}

const IMPORTED = 'changelog_imported_on';
const NOTE =
  /^[*-] (?<title>.+?) by @(?<author>[A-Za-z0-9-]+) in https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/(?<pr>\d+)$/;

export function importedOn(db: Database) {
  return db.prepare('SELECT value FROM state WHERE key = ?').get(IMPORTED)?.value as
    string | undefined;
}

export async function importChangelog(db: Database, bus: Bus, entries: RegistryEntry[]) {
  if (importedOn(db)) {
    return;
  }
  const now = new Date().toISOString();
  const day = now.slice(0, 10);
  transaction(db, () => {
    const insert = db.prepare(
      `INSERT OR IGNORE INTO releases (id, project, version, tag, previous, date, title, summary, groups)
       VALUES (?, ?, '1.0.0', NULL, NULL, ?, NULL, ?, '[]')`,
    );
    for (const entry of entries) {
      insert.run(
        `${entry.slug}-v1.0.0`,
        entry.slug,
        day,
        'Recorded as 1.0.0 when the changelog started fresh.',
      );
    }
    db.prepare('INSERT INTO state (key, value) VALUES (?, ?)').run(IMPORTED, day);
  });
  await bus.record({
    topic: 'releases',
    kind: 'sync',
    public: true,
    summary: `Changelog started: ${entries.length} projects at 1.0.0`,
    detail: { projects: entries.length },
    at: now,
  });
}

export function groupNotes(body: string) {
  const changes = new Map<string, ReleaseChange[]>();
  for (const line of body.split(/\r?\n/)) {
    const note = NOTE.exec(line.trim())?.groups;
    const change = note && classify(note.title);
    if (note && change) {
      changes.set(change.type, [
        ...(changes.get(change.type) ?? []),
        { text: change.text, commit: null, pr: Number(note.pr), author: note.author },
      ]);
    }
  }
  return (CHANGE_TYPES as ChangeType[]).flatMap((type): ReleaseGroup[] =>
    changes.has(type) ? [{ type, changes: changes.get(type)! }] : [],
  );
}

export function projectForTag(entries: RegistryEntry[], repo: string, tag: string) {
  const parsed = parseTag(tag);
  const inRepo = entries.filter((entry) => entry.repo.toLowerCase() === repo.toLowerCase());
  const project = parsed?.slug
    ? inRepo.find((entry) => entry.slug === parsed.slug)
    : inRepo.find((entry) => !entry.parent);
  return parsed && project ? { project, version: parsed.version } : undefined;
}

export async function recordRelease(
  db: Database,
  bus: Bus,
  entries: RegistryEntry[],
  repo: string,
  release: GitHubRelease,
) {
  const found = projectForTag(entries, repo, release.tag_name);
  const since = importedOn(db);
  if (!found || release.draft || !release.published_at || !since || release.published_at < since) {
    return;
  }
  const { project, version } = found;
  const previous = db
    .prepare('SELECT version, tag FROM releases WHERE project = ? AND tag IS NOT NULL')
    .all(project.slug)
    .filter((row) => compareVersions(row.version as string, version) < 0)
    .sort((a, b) => compareVersions(b.version as string, a.version as string))[0];
  const groups = groupNotes(release.body ?? '');
  const { changes } = db
    .prepare(
      `INSERT OR IGNORE INTO releases (id, project, version, tag, previous, date, title, summary, groups)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      `${project.slug}-v${version}`,
      project.slug,
      version,
      release.tag_name,
      (previous?.tag as string | undefined) ?? null,
      release.published_at.slice(0, 10),
      release.name && release.name !== release.tag_name ? release.name : null,
      groups.length > 0 ? null : 'No user-facing changes.',
      JSON.stringify(groups),
    );
  if (changes > 0) {
    await bus.record({
      topic: 'releases',
      key: project.slug,
      kind: 'release',
      public: true,
      summary: `${project.name} ${version}`,
      detail: {
        project: project.slug,
        version,
        counts: Object.fromEntries(groups.map((group) => [group.type, group.changes.length])),
      },
      at: release.published_at,
    });
  }
}

export async function syncReleases(db: Database, bus: Bus, entries: RegistryEntry[]) {
  for (const repo of new Set(entries.map((entry) => entry.repo.toLowerCase()))) {
    for (const release of await github<GitHubRelease[]>(`/repos/${repo}/releases?per_page=30`)) {
      await recordRelease(db, bus, entries, repo, release);
    }
  }
}
