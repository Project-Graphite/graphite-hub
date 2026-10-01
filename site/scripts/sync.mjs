import { access, mkdir, writeFile } from 'node:fs/promises';
import { stringify } from 'yaml';
import { loadRegistry, RELEASES } from './releases.mjs';
import { classify, compareVersions, concernsSibling, parseTag } from './rules.mjs';

const token = process.env.GH_TOKEN;
if (!token) {
  throw new Error('GH_TOKEN is required');
}

async function github(path) {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'project-graphite-changelog-sync',
    },
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    throw new Error(`GitHub answered ${response.status} for ${path}`);
  }

  return response.json();
}

async function paginate(path, select = (page) => page) {
  const items = [];
  for (let page = 1; ; page += 1) {
    const entries = select(
      await github(`${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`),
    );
    items.push(...entries);
    if (entries.length < 100) {
      return items;
    }
  }
}

async function exists(url) {
  try {
    await access(url);
    return true;
  } catch {
    return false;
  }
}

function releasesByProject(repo, projects, tags) {
  const inRepo = projects.filter((project) => project.repo.toLowerCase() === repo.toLowerCase());
  const topLevel = inRepo.find((project) => !project.parent);
  const found = new Map();

  for (const tag of tags) {
    const parsed = parseTag(tag.name);
    const project = parsed?.slug
      ? inRepo.find((candidate) => candidate.slug === parsed.slug)
      : topLevel;
    if (!parsed || !project) {
      continue;
    }

    const versions = found.get(project) ?? new Map();
    if (!versions.has(parsed.version)) {
      versions.set(parsed.version, { tag: tag.name, sha: tag.commit.sha });
    }
    found.set(project, versions);
  }

  return [...found].map(([project, versions]) => [
    project,
    [...versions]
      .sort(([a], [b]) => compareVersions(a, b))
      .map(([version, { tag, sha }]) => ({ version, tag, sha })),
  ]);
}

async function commitsFor(repo, previous, tag) {
  if (!previous) {
    return paginate(`/repos/${repo}/commits?sha=${encodeURIComponent(tag)}`);
  }

  const commits = await paginate(
    `/repos/${repo}/compare/${previous}...${tag}`,
    (page) => page.commits,
  );
  return commits.reverse();
}

async function draft(project, release, previous, siblings) {
  const [head, commits] = await Promise.all([
    github(`/repos/${project.repo}/commits/${release.sha}`),
    commitsFor(project.repo, previous, release.tag),
  ]);

  const changes = commits.flatMap((commit) => {
    const change = concernsSibling(commit.commit.message, project.slug, siblings)
      ? null
      : classify(commit.commit.message);
    return change
      ? [
          {
            type: change.type,
            text: change.text,
            commit: commit.sha.slice(0, 7),
            ...(change.pr ? { pr: change.pr } : {}),
            author: commit.author?.login ?? commit.commit.author.name,
          },
        ]
      : [];
  });

  return {
    project: project.slug,
    version: release.version,
    tag: release.tag,
    previous,
    date: head.commit.committer.date.slice(0, 10),
    title: null,
    summary: changes.length > 0 ? null : 'No user-facing changes.',
    changes,
  };
}

const { projects } = await loadRegistry();
const repos = [...new Set(projects.map((project) => project.repo.toLowerCase()))].sort();
const drafted = [];
const failed = [];

for (const repo of repos) {
  try {
    const tags = await paginate(`/repos/${repo}/tags`);

    for (const [project, releases] of releasesByProject(repo, projects, tags)) {
      const siblings = projects
        .filter((other) => project.parent && other.parent === project.parent && other !== project)
        .map((other) => other.slug);

      for (const [index, release] of releases.entries()) {
        const file = new URL(`${project.slug}/${release.version}.yml`, RELEASES);
        if (await exists(file)) {
          continue;
        }

        const entry = await draft(project, release, releases[index - 1]?.tag ?? null, siblings);
        await mkdir(new URL(`${project.slug}/`, RELEASES), { recursive: true });
        await writeFile(file, stringify(entry, { lineWidth: 100 }), 'utf8');
        drafted.push(`${project.slug}@${release.version}`);
      }
    }
  } catch (error) {
    console.error(`error: ${repo}: ${error.message}`);
    failed.push(repo);
  }
}

console.log(
  drafted.length > 0
    ? `Drafted ${drafted.length} releases: ${drafted.join(', ')}.`
    : 'Every tagged version already has a release entry.',
);

if (failed.length > 0) {
  console.error(`Could not read ${failed.join(', ')}; their releases were not drafted.`);
  process.exit(1);
}
