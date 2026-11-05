import { parse } from 'yaml';
import {
  classify,
  compareVersions,
  concernsSibling,
  nextVersion,
  parseTag,
  tagsFor,
} from './rules.mjs';

const token = process.env.GH_TOKEN;
if (!token) {
  throw new Error('GH_TOKEN is required');
}

const PLATFORM = 'Project-Graphite/platform';
const cut = process.argv.includes('--cut');
const only = process.argv
  .find((argument) => argument.startsWith('--repo='))
  ?.slice('--repo='.length)
  .toLowerCase();

async function github(path, init = {}, accept = 'application/vnd.github+json') {
  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: accept,
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'project-graphite-changelog-sync',
    },
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    throw new Error(`GitHub answered ${response.status} for ${path}`);
  }

  return accept === 'application/vnd.github+json' ? response.json() : response.text();
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

async function listedProjects() {
  const files = await github(`/repos/${PLATFORM}/contents/projects`);
  const entries = await Promise.all(
    files
      .filter((file) => file.name.endsWith('.yml'))
      .map(async (file) =>
        parse(
          await github(
            `/repos/${PLATFORM}/contents/projects/${file.name}`,
            {},
            'application/vnd.github.raw+json',
          ),
        ),
      ),
  );
  return entries
    .filter((entry) => entry.listed !== false)
    .map((entry) => ({
      slug: entry.slug,
      parent: entry.parent ?? null,
      repo: entry.repo,
      paths: entry.paths ?? [],
      releases: entry.releases ?? 'auto',
    }));
}

function latestByProject(inRepo, tags) {
  const topLevel = inRepo.find((project) => !project.parent);
  const found = new Map(inRepo.map((project) => [project, []]));

  for (const tag of tags) {
    const parsed = parseTag(tag.name);
    const project = parsed?.slug
      ? inRepo.find((candidate) => candidate.slug === parsed.slug)
      : topLevel;
    if (parsed && project) {
      found.get(project).push({ version: parsed.version, tag: tag.name });
    }
  }

  return [...found].map(([project, versions]) => [
    project,
    versions.sort((a, b) => compareVersions(a.version, b.version)).at(-1),
  ]);
}

async function commitsBetween(repo, previous, head) {
  if (!previous) {
    return paginate(`/repos/${repo}/commits?sha=${head}`);
  }

  const commits = await paginate(
    `/repos/${repo}/compare/${previous}...${head}`,
    (page) => page.commits,
  );
  return commits.reverse();
}

async function touching(repo, paths) {
  const shas = new Set();
  for (const path of paths) {
    for (const commit of await paginate(`/repos/${repo}/commits?path=${path}`)) {
      shas.add(commit.sha);
    }
  }
  return shas;
}

async function attribute(project, inRepo, commits) {
  if (project.paths.length > 0) {
    const own = await touching(project.repo, project.paths);
    return commits.filter((commit) => own.has(commit.sha));
  }

  const childPaths = inRepo
    .filter((other) => other.parent === project.slug)
    .flatMap((child) => child.paths);
  if (childPaths.length > 0) {
    const theirs = await touching(project.repo, childPaths);
    return commits.filter((commit) => !theirs.has(commit.sha));
  }

  const siblings = inRepo
    .filter((other) => project.parent && other.parent === project.parent && other !== project)
    .map((other) => other.slug);
  return commits.filter(
    (commit) => !concernsSibling(commit.commit.message, project.slug, siblings),
  );
}

async function nextRelease(project, inRepo, latest, branch) {
  const commits = await attribute(
    project,
    inRepo,
    await commitsBetween(project.repo, latest?.tag ?? null, branch),
  );
  const types = commits.flatMap((commit) => classify(commit.commit.message)?.type ?? []);
  if (types.length === 0) {
    return null;
  }

  const version = nextVersion(latest?.version ?? null, types);
  return { tag: tagsFor(project, version)[0], sha: commits[0].sha };
}

const projects = await listedProjects();
const repos = [...new Set(projects.map((project) => project.repo.toLowerCase()))]
  .filter((repo) => !only || repo === only)
  .sort();
const tagged = [];
const failed = [];

for (const repo of repos) {
  try {
    const inRepo = projects.filter((project) => project.repo.toLowerCase() === repo);
    const [tags, { default_branch: branch }] = await Promise.all([
      paginate(`/repos/${repo}/tags`),
      github(`/repos/${repo}`),
    ]);

    for (const [project, latest] of latestByProject(inRepo, tags)) {
      if (project.releases !== 'auto' || (project.parent && project.paths.length === 0)) {
        continue;
      }
      const release = await nextRelease(project, inRepo, latest, branch);
      if (release && cut) {
        await github(`/repos/${repo}/git/refs`, {
          method: 'POST',
          body: JSON.stringify({ ref: `refs/tags/${release.tag}`, sha: release.sha }),
        });
        tagged.push(`${repo}@${release.tag}`);
      } else if (release) {
        tagged.push(`${repo}@${release.tag} (not created without --cut)`);
      }
    }
  } catch (error) {
    console.error(`error: ${repo}: ${error.message}`);
    failed.push(repo);
  }
}

console.log(
  tagged.length > 0 ? `Tagged ${tagged.join(', ')}.` : 'No project has untagged changes.',
);

if (failed.length > 0) {
  console.error(`Could not read ${failed.join(', ')}; their versions were not cut.`);
  process.exit(1);
}
