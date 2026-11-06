import type { Directory } from './types';

export type Cadence = 'each' | 'weekly';
export type Scope =
  { kind: 'all' } | { kind: 'project'; slug: string } | { kind: 'member'; handle: string };

export const CADENCES: readonly Cadence[] = ['each', 'weekly'];
export const EMAIL_LIMIT = 254;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validEmail(value: string) {
  return value.length <= EMAIL_LIMIT && EMAIL.test(value);
}

export function isCadence(value: unknown): value is Cadence {
  return CADENCES.includes(value as Cadence);
}

export function parseScope(value: string): Scope | null {
  if (value === 'all') {
    return { kind: 'all' };
  }
  const [kind, ref] = value.split(':');
  if (kind === 'project' && ref) {
    return { kind, slug: ref };
  }
  if (kind === 'member' && ref) {
    return { kind, handle: ref };
  }
  return null;
}

export function scopeKey(scope: Scope) {
  switch (scope.kind) {
    case 'all':
      return 'all';
    case 'project':
      return `project:${scope.slug}`;
    case 'member':
      return `member:${scope.handle}`;
  }
}

export function knownScope(scope: Scope, directory: Pick<Directory, 'members' | 'projects'>) {
  switch (scope.kind) {
    case 'all':
      return true;
    case 'project':
      return directory.projects.some((project) => project.slug === scope.slug);
    case 'member':
      return directory.members.some((member) => member.handle === scope.handle);
  }
}

export function scopeMatches(scope: Scope, post: { author: string; project: string | null }) {
  switch (scope.kind) {
    case 'all':
      return true;
    case 'project':
      return post.project === scope.slug;
    case 'member':
      return post.author === scope.handle;
  }
}

export function describeScope(scope: Scope, directory: Pick<Directory, 'members' | 'projects'>) {
  switch (scope.kind) {
    case 'all':
      return 'every post';
    case 'project':
      return `posts about ${directory.projects.find((project) => project.slug === scope.slug)?.name ?? scope.slug}`;
    case 'member':
      return `posts by ${directory.members.find((member) => member.handle === scope.handle)?.name ?? scope.handle}`;
  }
}

export function describeChoice(
  scope: Scope,
  cadence: Cadence,
  directory: Pick<Directory, 'members' | 'projects'>,
) {
  const what = describeScope(scope, directory);
  return cadence === 'weekly'
    ? `${what}, gathered into one email a week`
    : `${what}, as it publishes`;
}
