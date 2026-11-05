import type { Presentation } from '../app/presentation.ts';
import { uploadUrl } from '../app/profile.ts';
import { readPresentations } from './presentation.ts';
import { readPending, type Pending } from './writeback.ts';
import type { Directory, Member, MemberLink, Project, Release, StackGroup } from '../app/types.ts';
import { compareVersions } from '../scripts/rules.mjs';
import type { Bus } from './bus.ts';
import { json, type Database } from './db.ts';
import { storedEntries, type RegistryEntry } from './registry.ts';
import type { Settings } from './settings.ts';

const TOPICS = new Set(['members', 'profiles', 'projects', 'releases', 'settings']);

type Block = { type: 'stack'; groups: StackGroup[] } | { type: 'links'; links: MemberLink[] };

export function projectFromEntry(entry: RegistryEntry): Project {
  return {
    slug: entry.slug,
    parent: entry.parent ?? null,
    kind: entry.kind,
    name: entry.name,
    summary: entry.summary,
    tags: entry.tags ?? [],
    repo: entry.repo,
    repoUrl: `https://github.com/${entry.repo}`,
    owner: entry.owner,
    authors: entry.authors,
    status: entry.status,
    pinned: entry.pinned ?? false,
    showcase: entry.showcase ?? null,
    url: entry.deploy.kind === 'none' ? null : `https://${entry.deploy.host}`,
    path: entry.parent ? `/${entry.parent}/${entry.slug}` : `/${entry.slug}`,
    coverUrl: null,
    accent: null,
    layout: 'window',
    feature: { note: '', screenshotUrl: null },
    pending: [],
    pullRequest: null,
  };
}

export function presentedProject(
  entry: RegistryEntry,
  presentation: Presentation | undefined,
  pending: Pending | undefined,
): Project {
  const base = projectFromEntry(entry);
  if (!presentation && !pending) {
    return base;
  }
  return {
    ...base,
    summary: presentation?.summary ?? base.summary,
    coverUrl: presentation?.coverUpload ? uploadUrl(presentation.coverUpload, 'cover') : null,
    accent: presentation?.accent ?? null,
    layout: presentation?.layout ?? 'window',
    feature: {
      note: presentation?.feature.note ?? '',
      screenshotUrl: presentation?.feature.screenshot
        ? uploadUrl(presentation.feature.screenshot, 'screenshot')
        : null,
    },
    pending: Object.keys(pending?.fields ?? {}),
    pullRequest: pending?.pullRequest ?? null,
  };
}

export function accentsFor(handles: string[], chosen: Map<string, string>, palette: string[]) {
  const taken = new Set(chosen.values());
  const free = palette.filter((colour) => !taken.has(colour));
  let next = 0;
  return new Map(
    handles.map((handle) => [
      handle,
      chosen.get(handle) ??
        (free.length > 0 ? free[next++ % free.length] : palette[next++ % palette.length]),
    ]),
  );
}

function build(db: Database, palette: string[]): Directory {
  const rows = db
    .prepare(
      `SELECT m.handle, m.login, m.name, m.avatar_url, m.public_repos, m.followers, m.github_since,
              p.headline, p.bio, p.blocks, p.accent, p.alias, p.avatar_upload, p.cover_upload, p.listed
         FROM members m LEFT JOIN profiles p USING (handle)
        ORDER BY m.joined_at, m.handle`,
    )
    .all();
  const accents = accentsFor(
    rows.map((row) => row.handle as string),
    new Map(
      rows.flatMap((row) => (row.accent ? [[row.handle as string, row.accent as string]] : [])),
    ),
    palette,
  );
  const members = rows
    .map((row): Member => {
      const blocks = json<Block[]>(row.blocks ?? '[]');
      const alias = (row.alias as string | null) ?? null;
      return {
        handle: row.handle as string,
        alias,
        github: row.login as string,
        name: row.name as string,
        avatarUrl: row.avatar_upload
          ? uploadUrl(row.avatar_upload as string, 'avatar')
          : (row.avatar_url as string),
        coverUrl: row.cover_upload ? uploadUrl(row.cover_upload as string, 'cover') : null,
        listed: row.listed !== 0,
        headline: row.headline as string | null,
        bio: row.bio as string | null,
        stack: blocks.flatMap((block) => (block.type === 'stack' ? block.groups : [])),
        links: blocks.flatMap((block) => (block.type === 'links' ? block.links : [])),
        publicRepos: row.public_repos as number | null,
        followers: row.followers as number | null,
        joined: row.github_since as string | null,
        accent: accents.get(row.handle as string)!,
        path: alias ? `/${alias}` : `/members/${row.handle as string}`,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const presentations = readPresentations(db);
  const pending = readPending(db);
  const projects = storedEntries(db)
    .map((entry) => ({ ...entry, ...pending.get(entry.slug)?.fields }))
    .filter((entry) => entry.listed !== false)
    .map((entry) =>
      presentedProject(entry, presentations.get(entry.slug), pending.get(entry.slug)),
    );
  const listed = new Set(projects.map((project) => project.slug));

  const releases = db
    .prepare('SELECT * FROM releases')
    .all()
    .filter((row) => listed.has(row.project as string))
    .map((row): Release => ({
      id: row.id as string,
      project: row.project as string,
      version: row.version as string,
      tag: row.tag as string | null,
      previous: row.previous as string | null,
      date: row.date as string,
      title: row.title as string | null,
      summary: row.summary as string | null,
      groups: json(row.groups),
    }))
    .sort(
      (a, b) =>
        b.date.localeCompare(a.date) ||
        compareVersions(b.version, a.version) ||
        a.project.localeCompare(b.project),
    );

  return { members, projects, releases };
}

export function createSnapshot(db: Database, bus: Bus, settings: Settings) {
  let current: Directory | undefined;
  let healthy = false;
  bus.listen(({ event }) => {
    if (TOPICS.has(event.topic)) {
      current = undefined;
    }
  });
  return {
    get() {
      if (!current) {
        healthy = false;
        current = build(db, settings.get()['site.accents']);
        healthy = true;
      }
      return current;
    },
    get healthy() {
      return healthy;
    },
  };
}

export type Snapshot = ReturnType<typeof createSnapshot>;
