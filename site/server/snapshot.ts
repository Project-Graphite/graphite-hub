import { uploadUrl } from '../app/profile.ts';
import type {
  Directory,
  Member,
  MemberLink,
  Project,
  Release,
  ReleaseGroup,
  StackGroup,
} from '../app/types.ts';
import { compareVersions } from '../scripts/rules.mjs';
import type { Bus } from './bus.ts';
import { json, type Database } from './db.ts';
import { readPublished } from './posts.ts';
import { readProjects, type ProjectRecord } from './projects.ts';
import type { Settings } from './settings.ts';

const TOPICS = new Set(['members', 'profiles', 'projects', 'releases', 'settings', 'posts']);

type Block = { type: 'stack'; groups: StackGroup[] } | { type: 'links'; links: MemberLink[] };

export function presentedProject(record: ProjectRecord): Project {
  return {
    slug: record.slug,
    parent: record.parent,
    kind: record.kind,
    name: record.name,
    summary: record.summary,
    tags: record.tags,
    repo: record.repo,
    repoUrl: `https://github.com/${record.repo}`,
    owner: record.owner,
    authors: record.authors,
    status: record.status,
    pinned: record.pinOrder !== null,
    pinOrder: record.pinOrder,
    showcase: record.showcase,
    url: record.deploy.kind === 'none' ? null : `https://${record.deploy.host}`,
    path: record.parent ? `/${record.parent}/${record.slug}` : `/${record.slug}`,
    coverUrl: record.coverUpload ? uploadUrl(record.coverUpload, 'cover') : null,
    accent: record.accent,
    layout: record.layout,
    feature: {
      note: record.feature.note,
      screenshotUrl: record.feature.screenshot
        ? uploadUrl(record.feature.screenshot, 'screenshot')
        : null,
      posts: record.feature.posts,
    },
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
      `SELECT m.handle, m.login, coalesce(p.name, m.name) AS name, m.avatar_url, m.public_repos,
              m.followers, m.github_since, p.headline, p.bio, p.blocks, p.accent, p.alias,
              p.avatar_upload, p.cover_upload, p.listed
         FROM members m LEFT JOIN profiles p USING (handle)
        WHERE m.left_at IS NULL
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

  const projects = readProjects(db)
    .filter((project) => project.listed)
    .map(presentedProject);
  const listed = new Set(projects.map((project) => project.slug));

  const releases = db
    .prepare('SELECT * FROM releases')
    .all()
    .filter((row) => listed.has(row.project as string))
    .map((row): Release => {
      const groups = json<ReleaseGroup[]>(row.groups);
      return {
        id: row.id as string,
        project: row.project as string,
        version: row.version as string,
        tag: row.tag as string | null,
        previous: row.previous as string | null,
        date: row.date as string,
        title: row.title as string | null,
        summary: row.summary as string | null,
        changes: groups.map(({ type, changes }) => ({ type, count: changes.length })),
        firstChange: groups[0]?.changes[0]?.text ?? null,
      };
    })
    .sort(
      (a, b) =>
        b.date.localeCompare(a.date) ||
        compareVersions(b.version, a.version) ||
        a.project.localeCompare(b.project),
    );

  const posts = readPublished(
    db,
    (author) => members.find((member) => member.handle === author)?.path,
  );

  return { members, projects, releases, posts };
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
