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
