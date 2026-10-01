export const CHANGE_TYPES = ['breaking', 'security', 'added', 'changed', 'fixed', 'removed'];

const CONVENTIONAL = /^(?<kind>[a-z]+)(?:\((?<scope>[^)]*)\))?(?<bang>!)?:\s*(?<text>.+)$/i;
const TAG =
  /^(?:(?<slug>[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?)\/)?v(?<version>\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/;
const PULL_REQUEST = /\s*\(#(\d+)\)$/;

const CONVENTIONAL_TYPES = {
  feat: 'added',
  fix: 'fixed',
  perf: 'changed',
  style: 'changed',
  revert: 'changed',
  security: 'security',
};

const LEADING_VERBS = [
  [/^(add|adds|added|introduce|create|support|enable)\b/i, 'added'],
  [/^(fix|fixes|fixed|correct|resolve|repair)\b/i, 'fixed'],
  [/^(remove|removes|removed|delete|drop)\b/i, 'removed'],
];

export function classify(message) {
  const [subject, ...body] = message.trim().split('\n');

  if (/^merge\b/i.test(subject)) {
    return null;
  }

  const pullRequest = subject.match(PULL_REQUEST);
  const line = pullRequest ? subject.slice(0, pullRequest.index) : subject;
  const conventional = line.match(CONVENTIONAL)?.groups;
  const breaking = Boolean(conventional?.bang) || /^BREAKING[ -]CHANGE:/m.test(body.join('\n'));
  const mapped = conventional && CONVENTIONAL_TYPES[conventional.kind.toLowerCase()];

  if (conventional && !mapped && !breaking) {
    return null;
  }

  const type = breaking
    ? 'breaking'
    : conventional
      ? conventional.scope?.toLowerCase() === 'security'
        ? 'security'
        : mapped
      : (LEADING_VERBS.find(([pattern]) => pattern.test(line))?.[1] ?? 'changed');
  const text = (conventional?.text ?? line).trim();

  return {
    type,
    text: text.charAt(0).toUpperCase() + text.slice(1),
    pr: pullRequest ? Number(pullRequest[1]) : null,
  };
}

export function concernsSibling(message, slug, siblings) {
  const mentions = (name) => new RegExp(`(^|[^a-z0-9-])${name}([^a-z0-9-]|$)`, 'i').test(message);
  return !mentions(slug) && siblings.some(mentions);
}

export function parseTag(tag) {
  const match = tag.match(TAG)?.groups;
  return match ? { slug: match.slug ?? null, version: match.version } : null;
}

export function isVersion(value) {
  return typeof value === 'string' && parseTag(`v${value}`) !== null;
}

function versionParts(version) {
  const [core, prerelease] = version.split(/-(.*)/s);
  return {
    core: core.split('.').map(Number),
    prerelease: prerelease ? prerelease.split('.') : [],
  };
}

export function compareVersions(a, b) {
  const left = versionParts(a);
  const right = versionParts(b);

  for (let index = 0; index < 3; index += 1) {
    if (left.core[index] !== right.core[index]) {
      return left.core[index] - right.core[index];
    }
  }

  if (left.prerelease.length === 0 || right.prerelease.length === 0) {
    return right.prerelease.length - left.prerelease.length;
  }

  for (
    let index = 0;
    index < Math.max(left.prerelease.length, right.prerelease.length);
    index += 1
  ) {
    const x = left.prerelease[index];
    const y = right.prerelease[index];

    if (x === undefined || y === undefined) {
      return x === undefined ? -1 : 1;
    }

    if (x !== y) {
      const xNumeric = /^\d+$/.test(x);
      const yNumeric = /^\d+$/.test(y);
      if (xNumeric && yNumeric) {
        return Number(x) - Number(y);
      }
      if (xNumeric !== yNumeric) {
        return xNumeric ? -1 : 1;
      }
      return x < y ? -1 : 1;
    }
  }

  return 0;
}

export function tagsFor(project, version) {
  return project.parent
    ? [`${project.slug}/v${version}`]
    : [`v${version}`, `${project.slug}/v${version}`];
}
