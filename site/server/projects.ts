import type { ProjectFields } from '../app/editing/contract.ts';
import { STATUS_LABEL } from '../app/model.ts';
import type { Feature } from '../app/presentation.ts';
import { Refused } from '../app/profile.ts';
import type { ProjectShowcase, ProjectStatus } from '../app/types.ts';
import type { Bus } from './bus.ts';
import { json, transaction, type Database } from './db.ts';
import type { RegistryEntry } from './registry.ts';

export interface ProjectRecord extends ProjectFields {
  slug: string;
  parent: string | null;
  kind: 'project' | 'epic';
  repo: string;
  deploy: RegistryEntry['deploy'];
}

const SELECT = `SELECT p.slug, p.repo, p.entry, p.name, p.summary, p.tags, p.status, p.listed, p.pin_order,
         p.showcase, p.owner, p.authors, pp.cover_upload, pp.accent, pp.layout, pp.feature
    FROM projects p LEFT JOIN project_presentation pp USING (slug)
   WHERE p.removed_at IS NULL`;

const FIELDS = [
  'name',
  'summary',
  'tags',
  'status',
  'listed',
  'pinOrder',
  'showcase',
  'owner',
  'authors',
  'coverUpload',
  'accent',
  'layout',
  'feature',
] as const satisfies readonly (keyof ProjectFields)[];

function fromRow(row: Record<string, unknown>): ProjectRecord {
  const entry = json<RegistryEntry>(row.entry);
  return {
    slug: row.slug as string,
    parent: entry.parent ?? null,
    kind: entry.kind,
    repo: row.repo as string,
    deploy: entry.deploy,
    name: row.name as string,
    summary: row.summary as string,
    tags: json(row.tags),
    status: row.status as ProjectStatus,
    listed: row.listed === 1,
    pinOrder: row.pin_order as number | null,
    showcase: row.showcase ? json<ProjectShowcase>(row.showcase) : null,
    owner: row.owner as string,
    authors: json(row.authors),
    coverUpload: (row.cover_upload as string | null) ?? null,
    accent: (row.accent as string | null) ?? null,
    layout: (row.layout as ProjectFields['layout'] | null) ?? 'window',
    feature: {
      note: '',
      screenshot: null,
      posts: [],
      ...json<Partial<Feature>>(row.feature ?? '{}'),
    },
  };
}

export function readProjects(db: Database) {
  return db.prepare(`${SELECT} ORDER BY p.slug`).all().map(fromRow);
}

export function readProject(db: Database, slug: string) {
  const row = db.prepare(`${SELECT} AND p.slug = ?`).get(slug);
  return row && fromRow(row);
}

export function projectExists(db: Database, slug: string) {
  return Boolean(
    db.prepare('SELECT 1 FROM projects WHERE slug = ? AND removed_at IS NULL').get(slug),
  );
}

export function projectSlugs(db: Database) {
  return new Set(
    db
      .prepare('SELECT slug FROM projects')
      .all()
      .map((row) => row.slug as string),
  );
}

export function fieldsOf(record: ProjectRecord) {
  return Object.fromEntries(FIELDS.map((key) => [key, record[key]])) as unknown as ProjectFields;
}

export function archiveUndeployed(db: Database) {
  return db
    .prepare(
      `UPDATE projects SET status = 'archived'
        WHERE status = 'live' AND removed_at IS NULL AND json_extract(entry, '$.deploy.kind') = 'none'
        RETURNING slug, name, listed`,
    )
    .all()
    .map((row) => ({
      slug: row.slug as string,
      name: row.name as string,
      listed: row.listed === 1,
    }));
}

export function statusLine(name: string, status: ProjectStatus) {
  return `${name} is now ${STATUS_LABEL[status]}`;
}

export function createProjects(db: Database, bus: Bus) {
  const exists = (sql: string, value: string) => Boolean(db.prepare(sql).get(value));

  function problem(record: ProjectRecord, change: Partial<ProjectFields>) {
    if (change.status === 'live' && record.deploy.kind === 'none') {
      return 'A project with no deployment cannot be live; its deploy block is in .graphite.yml.';
    }
    if (
      change.owner !== undefined &&
      !exists('SELECT 1 FROM members WHERE handle = ? AND left_at IS NULL', change.owner)
    ) {
      return `${change.owner} is not a member.`;
    }
    const stranger = change.authors?.find(
      (author) =>
        !exists('SELECT 1 FROM members WHERE login = ? COLLATE NOCASE AND left_at IS NULL', author),
    );
    if (stranger) {
      return `${stranger} is not a member.`;
    }
    for (const upload of [change.coverUpload, change.feature?.screenshot]) {
      if (upload != null && !exists('SELECT 1 FROM uploads WHERE id = ?', upload)) {
        return 'That image is not an upload.';
      }
    }
    if (
      change.feature?.posts.some(
        (id) => !exists("SELECT 1 FROM posts WHERE id = ? AND status = 'published'", id),
      )
    ) {
      return 'The feature slot links published posts.';
    }
    return null;
  }

  return {
    all: () => readProjects(db),
    read: (slug: string) => readProject(db, slug),
    ownedBy: (handle: string) => readProjects(db).filter((project) => project.owner === handle),

    async save(slug: string, change: Partial<ProjectFields>, by: string) {
      const record = readProject(db, slug);
      if (!record) {
        throw new Refused(`${slug} is not a project.`);
      }
      const refused = problem(record, change);
      if (refused) {
        throw new Refused(refused);
      }
      const current = fieldsOf(record);
      const next = { ...current, ...change };
      if (JSON.stringify(next) === JSON.stringify(current)) {
        return;
      }
      const at = new Date().toISOString();
      transaction(db, () => {
        db.prepare(
          `UPDATE projects SET name = ?, summary = ?, tags = ?, status = ?, listed = ?, pin_order = ?,
             showcase = ?, owner = ?, authors = ?, edited_at = ?, edited_by = ? WHERE slug = ?`,
        ).run(
          next.name,
          next.summary,
          JSON.stringify(next.tags),
          next.status,
          next.listed ? 1 : 0,
          next.pinOrder,
          next.showcase && JSON.stringify(next.showcase),
          next.owner,
          JSON.stringify(next.authors),
          at,
          by,
          slug,
        );
        db.prepare(
          `INSERT INTO project_presentation (slug, cover_upload, accent, layout, feature, updated_at, updated_by)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (slug) DO UPDATE SET cover_upload = excluded.cover_upload, accent = excluded.accent,
             layout = excluded.layout, feature = excluded.feature, updated_at = excluded.updated_at,
             updated_by = excluded.updated_by`,
        ).run(
          slug,
          next.coverUpload,
          next.accent,
          next.layout,
          JSON.stringify(next.feature),
          at,
          by,
        );
        db.prepare(
          "INSERT INTO versions (kind, key, blob, by, at) VALUES ('project', ?, ?, ?, ?)",
        ).run(slug, JSON.stringify(next), by, at);
      });
      const line =
        next.listed && !current.listed
          ? `${next.name} was listed`
          : next.listed && next.status !== current.status
            ? statusLine(next.name, next.status)
            : null;
      const event = {
        topic: 'projects',
        key: slug,
        kind: 'project',
        public: true,
        actor: by,
        summary: line ?? `${slug} changed`,
        detail: { project: slug, status: next.status },
        at,
      };
      await (line ? bus.record(event) : bus.publish(event));
    },
  };
}

export type Projects = ReturnType<typeof createProjects>;
