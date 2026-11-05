import { isMap, isScalar, isSeq, parseDocument } from 'yaml';
import { REGISTRY_FIELDS, registryProblem, type RegistryFields } from '../app/presentation.ts';
import { Refused } from '../app/profile.ts';
import type { Bus } from './bus.ts';
import { json, type Database } from './db.ts';
import { GitHubError } from './github.ts';
import type { RegistryEntry } from './registry.ts';
import { storedEntries } from './registry.ts';

export interface GitHubCall {
  <T>(path: string, init?: RequestInit): Promise<T>;
}

export interface Pending {
  fields: Partial<RegistryFields>;
  pullRequest: string | null;
}

function registryFieldsOf(entry: RegistryEntry): RegistryFields {
  return {
    name: entry.name,
    summary: entry.summary.trim(),
    tags: entry.tags ?? [],
    status: entry.status,
    pinned: entry.pinned ?? false,
    listed: entry.listed ?? true,
  };
}

export function changedFields(entry: RegistryEntry, wanted: Partial<RegistryFields>) {
  const current = registryFieldsOf(entry);
  return Object.fromEntries(
    REGISTRY_FIELDS.filter(
      (key) =>
        wanted[key] !== undefined && JSON.stringify(wanted[key]) !== JSON.stringify(current[key]),
    ).map((key) => [key, wanted[key]]),
  ) as Partial<RegistryFields>;
}

export function rewriteManifest(text: string, slug: string, fields: Partial<RegistryFields>) {
  const document = parseDocument(text);
  const projects = document.get('projects');
  if (!isSeq(projects)) {
    throw new Refused('The repository’s .graphite.yml has no projects list.');
  }
  const index = projects.items.findIndex((item) => isMap(item) && item.get('slug') === slug);
  if (index < 0) {
    throw new Refused(`The repository’s .graphite.yml has no entry for ${slug}.`);
  }
  for (const [key, value] of Object.entries(fields)) {
    const path = ['projects', index, key];
    const node = document.getIn(path, true);
    if (isScalar(node) && !Array.isArray(value)) {
      node.value = value;
    } else if (isSeq(node) && Array.isArray(value)) {
      const next = document.createNode(value);
      next.flow = node.flow;
      document.setIn(path, next);
    } else {
      document.setIn(path, value);
    }
  }
  return document.toString();
}

export function readPending(db: Database) {
  return new Map(
    db
      .prepare('SELECT slug, fields, pull_request FROM registry_pending')
      .all()
      .map((row): [string, Pending] => [
        row.slug as string,
        {
          fields: json<Partial<RegistryFields>>(row.fields),
          pullRequest: row.pull_request as string | null,
        },
      ]),
  );
}

export function settlePending(db: Database, entries: RegistryEntry[]) {
  for (const [slug, pending] of readPending(db)) {
    const entry = entries.find((candidate) => candidate.slug === slug);
    if (!entry || Object.keys(changedFields(entry, pending.fields)).length === 0) {
      db.prepare('DELETE FROM registry_pending WHERE slug = ?').run(slug);
    }
  }
}

interface Contents {
  content: string;
  sha: string;
}

export function createWriteback(db: Database, bus: Bus, github: GitHubCall) {
  async function commit(
    repo: string,
    branch: string | undefined,
    text: string,
    sha: string,
    message: string,
  ) {
    await github(`/repos/${repo}/contents/.graphite.yml`, {
      method: 'PUT',
      body: JSON.stringify({
        message,
        content: Buffer.from(text).toString('base64'),
        sha,
        ...(branch ? { branch } : {}),
      }),
    });
  }

  return {
    ownedBy(handle: string) {
      const pending = readPending(db);
      return storedEntries(db)
        .filter((entry) => entry.owner === handle)
        .map((entry) => ({
          slug: entry.slug,
          name: pending.get(entry.slug)?.fields.name ?? entry.name,
          pending: Object.keys(pending.get(entry.slug)?.fields ?? {}),
          pullRequest: pending.get(entry.slug)?.pullRequest ?? null,
        }));
    },

    current(slug: string) {
      const entry = storedEntries(db).find((candidate) => candidate.slug === slug);
      const pending = readPending(db).get(slug);
      return entry && registryFieldsOf({ ...entry, ...pending?.fields });
    },

    async settle(entries: RegistryEntry[]) {
      settlePending(db, entries);
      for (const [slug, pending] of readPending(db)) {
        const pull = pending.pullRequest?.match(/github\.com\/(.+)\/pull\/(\d+)$/);
        if (!pull) {
          continue;
        }
        const state = await github<{ state: string; merged_at: string | null }>(
          `/repos/${pull[1]}/pulls/${pull[2]}`,
        );
        if (state.state === 'closed' && !state.merged_at) {
          db.prepare('DELETE FROM registry_pending WHERE slug = ?').run(slug);
        }
      }
    },

    async write(slug: string, wanted: Partial<RegistryFields>, by: string) {
      const problem = registryProblem(wanted);
      if (problem) {
        throw new Refused(problem);
      }
      const entry = storedEntries(db).find((candidate) => candidate.slug === slug);
      if (!entry) {
        throw new Refused(`${slug} is not in the registry.`);
      }
      const fields = changedFields(entry, wanted);
      if (Object.keys(fields).length === 0) {
        return { outcome: 'unchanged' as const };
      }
      const file = await github<Contents>(`/repos/${entry.repo}/contents/.graphite.yml`).catch(
        (error: unknown) => {
          if (error instanceof GitHubError && error.status === 404) {
            throw new Refused(
              `${entry.repo} has no .graphite.yml; its entry is edited in platform/projects.`,
            );
          }
          if (error instanceof GitHubError) {
            throw new Refused(`GitHub answered ${error.status} reading ${entry.repo}.`);
          }
          throw error;
        },
      );
      const before = Buffer.from(file.content, 'base64').toString('utf8');
      const after = rewriteManifest(before, slug, fields);
      const message = `chore(registry): ${Object.keys(fields).join(', ')} for ${slug} [skip ci]`;
      const propose = async () => {
        const { default_branch: base } = await github<{ default_branch: string }>(
          `/repos/${entry.repo}`,
        );
        const head = await github<{ object: { sha: string } }>(
          `/repos/${entry.repo}/git/ref/heads/${base}`,
        );
        const branch = `registry/${slug}-${Date.now().toString(36)}`;
        await github(`/repos/${entry.repo}/git/refs`, {
          method: 'POST',
          body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: head.object.sha }),
        });
        await commit(entry.repo, branch, after, file.sha, message);
        const pull = await github<{ html_url: string }>(`/repos/${entry.repo}/pulls`, {
          method: 'POST',
          body: JSON.stringify({
            title: message.replace(' [skip ci]', ''),
            head: branch,
            base,
            body: `Changed on project-graphite.com by ${by}.`,
          }),
        });
        return pull.html_url;
      };
      const pullRequest = await commit(entry.repo, undefined, after, file.sha, message)
        .then(() => null)
        .catch((error: unknown) => {
          if (error instanceof GitHubError && [403, 409, 422].includes(error.status)) {
            return propose();
          }
          throw error;
        })
        .catch((error: unknown) => {
          if (error instanceof GitHubError) {
            throw new Refused(
              `GitHub answered ${error.status} for ${entry.repo}; the platform App needs contents and pull request write there.`,
            );
          }
          throw error;
        });
      const previous = readPending(db).get(slug)?.fields ?? {};
      const at = new Date().toISOString();
      db.prepare(
        `INSERT INTO registry_pending (slug, fields, pull_request, by, at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (slug) DO UPDATE SET fields = excluded.fields, pull_request = excluded.pull_request,
           by = excluded.by, at = excluded.at`,
      ).run(slug, JSON.stringify({ ...previous, ...fields }), pullRequest, by, at);
      await bus.publish({
        topic: 'projects',
        key: slug,
        kind: 'registry',
        public: true,
        actor: by,
        summary: `${slug} registry fields sent to ${entry.repo}`,
        detail: { fields: Object.keys(fields), pullRequest },
        at,
      });
      return {
        outcome: pullRequest ? ('pull-request' as const) : ('committed' as const),
        pullRequest,
      };
    },
  };
}

export type Writeback = ReturnType<typeof createWriteback>;
