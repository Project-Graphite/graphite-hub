import Ajv2020 from 'ajv/dist/2020.js';
import { parse } from 'yaml';
import type { ProjectShowcase, ProjectStatus } from '../app/types.ts';
import type { Bus } from './bus.ts';
import { config } from './config.ts';
import { json, transaction, type Database } from './db.ts';
import { github, githubText } from './github.ts';
import { log } from './log.ts';

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

export function storedEntries(db: Database) {
  return db
    .prepare('SELECT entry FROM projects ORDER BY slug')
    .all()
    .map((row) => json<RegistryEntry>(row.entry));
}

export function applyEntries(db: Database, entries: RegistryEntry[], now: string) {
  const existing = new Map(
    db
      .prepare('SELECT slug, entry FROM projects')
      .all()
      .map((row) => [row.slug as string, row.entry as string]),
  );
  const incoming = new Map(entries.map((entry) => [entry.slug, JSON.stringify(entry)]));
  const added = [...incoming.keys()].filter((slug) => !existing.has(slug));
  const removed = [...existing.keys()].filter((slug) => !incoming.has(slug));
  const changed = [...incoming].filter(
    ([slug, entry]) => existing.has(slug) && existing.get(slug) !== entry,
  );
  transaction(db, () => {
    const upsert = db.prepare(
      `INSERT INTO projects (slug, repo, entry, synced_at) VALUES (?, ?, ?, ?)
       ON CONFLICT (slug) DO UPDATE SET repo = excluded.repo, entry = excluded.entry, synced_at = excluded.synced_at`,
    );
    for (const entry of entries) {
      upsert.run(entry.slug, entry.repo, incoming.get(entry.slug)!, now);
    }
    const remove = db.prepare('DELETE FROM projects WHERE slug = ?');
    for (const slug of removed) {
      remove.run(slug);
    }
  });
  return { added, removed, changed: changed.map(([slug]) => slug) };
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
  const { added, removed, changed } = applyEntries(db, entries, now);
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
  return entries;
}

export function dispatchPlatformSync() {
  return github(`/repos/${config.platformRepo}/dispatches`, {
    method: 'POST',
    body: JSON.stringify({ event_type: 'sync-registry' }),
  });
}
