import { access, mkdir, writeFile } from 'node:fs/promises';
import { stringify } from 'yaml';
import { loadRegistry, RELEASES } from './releases.mjs';
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

const cut = process.argv.includes('--cut');
const only = process.argv
  .find((argument) => argument.startsWith('--repo='))
  ?.slice('--repo='.length)
  .toLowerCase();

async function github(path, init = {}) {
  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
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

function releasesByProject(inRepo, tags) {
  const topLevel = inRepo.find((project) => !project.parent);
  const found = new Map(inRepo.map((project) => [project, new Map()]));

  for (const tag of tags) {
    const parsed = parseTag(tag.name);
    const project = parsed?.slug
      ? inRepo.find((candidate) => candidate.slug === parsed.slug)
      : topLevel;
    if (parsed && project && !found.get(project).has(parsed.version)) {
      found.get(project).set(parsed.version, { tag: tag.name, sha: tag.commit.sha });
    }
  }

  return [...found].map(([project, versions]) => [
    project,
    [...versions]
      .sort(([a], [b]) => compareVersions(a, b))
      .map(([version, { tag, sha }]) => ({ version, tag, sha })),
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

async function draft(project, inRepo, release, previous) {
  const [head, commits] = await Promise.all([
    github(`/repos/${project.repo}/commits/${release.sha}`),
    commitsBetween(project.repo, previous, release.sha),
  ]);

  const changes = (await attribute(project, inRepo, commits)).flatMap((commit) => {
    const change = classify(commit.commit.message);
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
  return { version, tag: tagsFor(project, version)[0], sha: commits[0].sha };
}

const { projects } = await loadRegistry();
const repos = [...new Set(projects.map((project) => project.repo.toLowerCase()))]
  .filter((repo) => !only || repo === only)
  .sort();
const drafted = [];
const tagged = [];
const failed = [];

for (const repo of repos) {
  try {
    const inRepo = projects.filter((project) => project.repo.toLowerCase() === repo);
    const [tags, { default_branch: branch }] = await Promise.all([
      paginate(`/repos/${repo}/tags`),
      github(`/repos/${repo}`),
    ]);

    for (const [project, releases] of releasesByProject(inRepo, tags)) {
      if (project.releases === 'auto' && !(project.parent && project.paths.length === 0)) {
        const release = await nextRelease(project, inRepo, releases.at(-1), branch);
        if (release && cut) {
          await github(`/repos/${repo}/git/refs`, {
            method: 'POST',
            body: JSON.stringify({ ref: `refs/tags/${release.tag}`, sha: release.sha }),
          });
          releases.push(release);
          tagged.push(`${repo}@${release.tag}`);
        } else if (release) {
          tagged.push(`${repo}@${release.tag} (not created without --cut)`);
        }
      }

      for (const [index, release] of releases.entries()) {
        const file = new URL(`${project.slug}/${release.version}.yml`, RELEASES);
        if (await exists(file)) {
          continue;
        }

        const entry = await draft(project, inRepo, release, releases[index - 1]?.tag ?? null);
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
  tagged.length > 0 ? `Tagged ${tagged.join(', ')}.` : 'No project has untagged changes.',
);
console.log(
  drafted.length > 0
    ? `Drafted ${drafted.length} releases: ${drafted.join(', ')}.`
    : 'Every tagged version already has a release entry.',
);

if (failed.length > 0) {
  console.error(`Could not read ${failed.join(', ')}; their releases were not drafted.`);
  process.exit(1);
}
