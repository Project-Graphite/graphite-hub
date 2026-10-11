export interface Project {
  slug: string;
  parent: string | null;
  kind: 'project' | 'epic';
  name: string;
  summary: string;
  tags: string[];
  repo: string;
  repoUrl: string;
  owner: string;
  authors: string[];
  status: 'live' | 'wip' | 'archived' | 'source-only';
  paths: string[];
  releases: 'auto' | 'manual';
  pinned: boolean;
  listedOn: string;
  showcase: ProjectShowcase | null;
  url: string | null;
  path: string;
}

export interface ProjectContribution {
  github: string;
  summary: string;
}

export interface ProjectShowcase {
  problem: string;
  approach: string;
  outcome: string;
  contributions: ProjectContribution[];
}

export interface MemberLink {
  label: string;
  url: string;
}

export interface StackGroup {
  group: string;
  items: string[];
}

export interface Member {
  handle: string;
  github: string;
  name: string;
  headline: string | null;
  bio: string | null;
  stack: StackGroup[];
  links: MemberLink[];
  path: string;
}

export interface GithubProfile {
  avatarUrl: string;
  publicRepos: number | null;
  followers: number | null;
  joined: string | null;
}

export interface Registry {
  members: Member[];
  projects: Project[];
}

export type ChangeType = 'breaking' | 'security' | 'added' | 'changed' | 'fixed' | 'removed';

export interface ReleaseChange {
  text: string;
  commit: string;
  pr: number | null;
  author: string | null;
}

export interface Release {
  id: string;
  project: string;
  version: string;
  tag: string;
  previous: string | null;
  date: string;
  title: string | null;
  summary: string | null;
  groups: { type: ChangeType; changes: ReleaseChange[] }[];
}

export interface Changelog {
  releases: Release[];
}
