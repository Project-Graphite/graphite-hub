import { readdir, readFile } from 'node:fs/promises';
import { parse } from 'yaml';
import { CHANGE_TYPES, compareVersions, isVersion, parseTag, tagsFor } from './rules.mjs';

export const RELEASES = new URL('../../releases/', import.meta.url);
export const REGISTRY = new URL('../src/data/registry.json', import.meta.url);

const FIELDS = new Set([
  'project',
  'version',
  'tag',
  'previous',
  'date',
  'title',
  'summary',
  'changes',
]);
const CHANGE_FIELDS = new Set(['type', 'text', 'commit', 'pr', 'author']);
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const COMMIT = /^[0-9a-f]{7,40}$/;

const isText = (value) => typeof value === 'string' && value.trim().length > 0;
const isOptionalText = (value) => value === undefined || value === null || isText(value);

export async function loadRegistry() {
  return JSON.parse(await readFile(REGISTRY, 'utf8'));
}

function changeProblems(change, index) {
  if (typeof change !== 'object' || change === null || Array.isArray(change)) {
    return [`changes[${index}] must be a mapping`];
  }

  return [
    ...Object.keys(change)
      .filter((key) => !CHANGE_FIELDS.has(key))
      .map((key) => `changes[${index}] has an unknown field ${key}`),
    ...(CHANGE_TYPES.includes(change.type)
      ? []
      : [`changes[${index}].type must be one of ${CHANGE_TYPES.join(', ')}`]),
    ...(isText(change.text) ? [] : [`changes[${index}].text must be non-empty text`]),
    ...(typeof change.commit === 'string' && COMMIT.test(change.commit)
      ? []
      : [`changes[${index}].commit must be a 7 to 40 character commit SHA`]),
    ...(change.pr === undefined ||
    change.pr === null ||
    (Number.isInteger(change.pr) && change.pr > 0)
      ? []
      : [`changes[${index}].pr must be a pull request number`]),
    ...(isOptionalText(change.author) ? [] : [`changes[${index}].author must be text`]),
  ];
}

function releaseProblems(entry, slug, version, project) {
  if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
    return ['must be a mapping'];
  }

  const changes = Array.isArray(entry.changes) ? entry.changes : [];

  return [
    ...Object.keys(entry)
      .filter((key) => !FIELDS.has(key))
      .map((key) => `has an unknown field ${key}`),
    ...(project ? [] : [`${slug} is not a listed project in the registry`]),
    ...(entry.project === slug ? [] : [`project must be ${slug}, the name of its folder`]),
    ...(isVersion(version) ? [] : [`${version} is not a semantic version such as 1.4.0`]),
    ...(entry.version === version ? [] : [`version must be ${version}, the name of its file`]),
    ...(project && isVersion(version) && !tagsFor(project, version).includes(entry.tag)
      ? [`tag must be ${tagsFor(project, version).join(' or ')}`]
      : []),
    ...(entry.previous === undefined || entry.previous === null || parseTag(String(entry.previous))
      ? []
      : ['previous must be a version tag or null']),
    ...(typeof entry.date === 'string' && DATE.test(entry.date) ? [] : ['date must be YYYY-MM-DD']),
    ...(isOptionalText(entry.title) ? [] : ['title must be text or null']),
    ...(isOptionalText(entry.summary) ? [] : ['summary must be text or null']),
    ...(Array.isArray(entry.changes) ? [] : ['changes must be a list']),
    ...changes.flatMap(changeProblems),
    ...(changes.length > 0 || isText(entry.summary)
      ? []
      : ['needs at least one change or a summary']),
  ];
}

export async function loadReleases(projects) {
  const releases = [];
  const problems = [];
  const folders = (await readdir(RELEASES, { withFileTypes: true })).filter((entry) =>
    entry.isDirectory(),
  );

  for (const folder of folders) {
    const slug = folder.name;
    const project = projects.find((candidate) => candidate.slug === slug);

    for (const file of await readdir(new URL(`${slug}/`, RELEASES))) {
      const path = `releases/${slug}/${file}`;

      if (!file.endsWith('.yml')) {
        problems.push(`${path}: release files use the .yml extension`);
        continue;
      }

      let entry;
      try {
        entry = parse(await readFile(new URL(`${slug}/${file}`, RELEASES), 'utf8'));
      } catch (error) {
        problems.push(`${path}: is not valid YAML: ${error.message}`);
        continue;
      }

      const version = file.slice(0, -'.yml'.length);
      const found = releaseProblems(entry, slug, version, project);
      if (found.length > 0) {
        problems.push(...found.map((problem) => `${path}: ${problem}`));
        continue;
      }

      releases.push({
        id: `${slug}-v${version}`,
        project: slug,
        version,
        tag: entry.tag,
        previous: entry.previous ?? null,
        date: entry.date,
        title: entry.title?.trim() ?? null,
        summary: entry.summary?.trim() ?? null,
        groups: CHANGE_TYPES.map((type) => ({
          type,
          changes: entry.changes
            .filter((change) => change.type === type)
            .map((change) => ({
              text: change.text.trim(),
              commit: change.commit,
              pr: change.pr ?? null,
              author: change.author ?? null,
            })),
        })).filter((group) => group.changes.length > 0),
      });
    }
  }

  releases.sort(
    (a, b) =>
      b.date.localeCompare(a.date) ||
      compareVersions(b.version, a.version) ||
      a.project.localeCompare(b.project),
  );

  return { releases, problems };
}
