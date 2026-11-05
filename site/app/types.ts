export type ProjectStatus = 'live' | 'wip' | 'archived' | 'source-only';

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
  status: ProjectStatus;
  pinned: boolean;
  showcase: ProjectShowcase | null;
  url: string | null;
  path: string;
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
  avatarUrl: string;
  headline: string | null;
  bio: string | null;
  stack: StackGroup[];
  links: MemberLink[];
  publicRepos: number | null;
  followers: number | null;
  joined: string | null;
  accent: string;
  path: string;
}

export type ChangeType = 'breaking' | 'security' | 'added' | 'changed' | 'fixed' | 'removed';

export interface ReleaseChange {
  text: string;
  commit: string | null;
  pr: number | null;
  author: string | null;
}

export interface ReleaseGroup {
  type: ChangeType;
  changes: ReleaseChange[];
}

export interface Release {
  id: string;
  project: string;
  version: string;
  tag: string | null;
  previous: string | null;
  date: string;
  title: string | null;
  summary: string | null;
  groups: ReleaseGroup[];
}

export interface Directory {
  members: Member[];
  projects: Project[];
  releases: Release[];
}

export interface ConsoleLine {
  id: string;
  kind: string;
  at: string;
  summary: string;
  detail: Record<string, unknown>;
}

export type Day = 'up' | 'down' | 'none';

export interface Running {
  slug: string;
  name: string;
  path: string;
  deploy: { tag: string; at: string } | null;
  week: Day[];
}

export interface Counts {
  members: number;
  projects: number;
  live: number;
  releases: number;
  deploys: number;
}

export interface Viewer {
  login: string;
  avatarUrl: string;
  owner: boolean;
}
