import Ajv2020 from 'ajv/dist/2020.js';
import { parse } from 'yaml';
import type { ProjectShowcase, ProjectStatus } from '../app/types.ts';
import type { Bus } from './bus.ts';
import { config } from './config.ts';
import { json, transaction, type Database } from './db.ts';
import { github, githubText } from './github.ts';
import { log } from './log.ts';
import { archiveUndeployed, statusLine } from './projects.ts';

export interface RegistryEntry {
  slug: string;
  parent?: string;
  kind: 'project' | 'epic';
  name: string;
  summary: string;
  tags?: string[];
  repo: string;
  owner: string;
  authors: string[];
  status: ProjectStatus;
  listed?: boolean;
  pinned?: boolean;
  paths?: string[];
  releases?: 'auto' | 'manual';
  showcase?: ProjectShowcase;
  deploy: { kind: 'compose' | 'pages'; host: string } | { kind: 'none' };
}

const INFRASTRUCTURE = ['parent', 'kind', 'repo', 'deploy', 'paths', 'releases'] as const;

function infrastructure(entry: RegistryEntry) {
  return JSON.stringify(INFRASTRUCTURE.map((key) => entry[key] ?? null));
}

export function validateEntries(schema: object, files: { name: string; text: string }[]) {
  const ajv = new Ajv2020({ allErrors: true });
  const valid = ajv.compile<RegistryEntry>(schema);
  const entries: RegistryEntry[] = [];
  const problems: string[] = [];
  for (const { name, text } of files) {
    const entry: unknown = parse(text);
    if (!valid(entry)) {
      problems.push(`projects/${name}: ${ajv.errorsText(valid.errors)}`);
    } else if (`${entry.slug}.yml` !== name) {
      problems.push(`projects/${name}: slug ${entry.slug} does not match the file name`);
    } else {
      entries.push(entry);
    }
  }
  return { entries, problems };
}

export function applyEntries(db: Database, entries: RegistryEntry[], now: string, complete = true) {
  const existing = new Map(
    db
      .prepare('SELECT slug, entry, removed_at FROM projects')
      .all()
      .map((row) => [row.slug as string, row]),
  );
  const present = (slug: string) => existing.has(slug) && existing.get(slug)!.removed_at === null;
  const incoming = new Set(entries.map((entry) => entry.slug));
  const removed = complete
    ? [...existing.keys()].filter((slug) => present(slug) && !incoming.has(slug))
    : [];
  transaction(db, () => {
    const seed = db.prepare(
      `INSERT INTO projects (slug, repo, entry, synced_at, name, summary, tags, status, listed, pin_order, showcase, owner, authors)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const refresh = db.prepare(
      'UPDATE projects SET repo = ?, entry = ?, synced_at = ?, removed_at = NULL WHERE slug = ?',
    );
    for (const entry of entries) {
      if (existing.has(entry.slug)) {
        refresh.run(entry.repo, JSON.stringify(entry), now, entry.slug);
      } else {
        seed.run(
          entry.slug,
          entry.repo,
          JSON.stringify(entry),
          now,
          entry.name,
          entry.summary.trim(),
          JSON.stringify(entry.tags ?? []),
          entry.status,
          entry.listed === false ? 0 : 1,
          entry.pinned ? 0 : null,
          entry.showcase ? JSON.stringify(entry.showcase) : null,
          entry.owner,
          JSON.stringify(entry.authors),
        );
      }
    }
    const remove = db.prepare('UPDATE projects SET removed_at = ? WHERE slug = ?');
    for (const slug of removed) {
      remove.run(now, slug);
    }
  });
  return {
    added: entries.filter((entry) => !present(entry.slug)).map((entry) => entry.slug),
    removed,
    changed: entries
      .filter(
        (entry) =>
          present(entry.slug) &&
          infrastructure(json(existing.get(entry.slug)!.entry)) !== infrastructure(entry),
      )
      .map((entry) => entry.slug),
  };
}

export async function syncRegistry(db: Database, bus: Bus) {
  const [schema, listing] = await Promise.all([
    githubText(`/repos/${config.platformRepo}/contents/schema/project.schema.json`),
    github<{ name: string; type: string }[]>(`/repos/${config.platformRepo}/contents/projects`),
  ]);
  const files = await Promise.all(
    listing
      .filter((file) => file.type === 'file' && file.name.endsWith('.yml'))
      .map(async (file) => ({
        name: file.name,
        text: await githubText(`/repos/${config.platformRepo}/contents/projects/${file.name}`),
      })),
  );
  const { entries, problems } = validateEntries(JSON.parse(schema), files);
  for (const problem of problems) {
    log.warn({ problem }, 'registry entry skipped');
  }
  const now = new Date().toISOString();
  const seeded = db.prepare('SELECT 1 FROM projects').get() !== undefined;
  const { added, removed, changed } = applyEntries(db, entries, now, problems.length === 0);
  const archived = archiveUndeployed(db);
  if (added.length + removed.length + changed.length > 0) {
    await bus.record({
      topic: 'projects',
      kind: 'sync',
      public: true,
      summary: `Registry synced: ${added.length} added, ${changed.length} changed, ${removed.length} removed`,
      detail: { added, changed, removed, skipped: problems.length },
      at: now,
    });
  }
  const lines = [
    ...(seeded
      ? db
          .prepare(
            'SELECT slug, name FROM projects WHERE listed = 1 AND slug IN (SELECT value FROM json_each(?))',
          )
          .all(JSON.stringify(added))
          .map((row) => ({ slug: row.slug as string, summary: `${row.name as string} was added` }))
      : []),
    ...archived
      .filter((project) => project.listed)
      .map(({ slug, name }) => ({ slug, summary: statusLine(name, 'archived') })),
  ];
  for (const { slug, summary } of lines) {
    await bus.record({
      topic: 'projects',
      key: slug,
      kind: 'project',
      public: true,
      summary,
      detail: { project: slug },
      at: now,
    });
  }
}

export function dispatchPlatformSync() {
  return github(`/repos/${config.platformRepo}/dispatches`, {
    method: 'POST',
    body: JSON.stringify({ event_type: 'sync-registry' }),
  });
}
