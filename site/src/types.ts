export interface Project {
  slug: string;
  name: string;
  summary: string;
  tags: string[];
  repo: string;
  repoUrl: string;
  owner: string;
  authors: string[];
  status: string;
  featured: boolean;
  showcase: ProjectShowcase | null;
  url: string | null;
  path: string;
  legacyPath: string;
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

export interface PersonLink {
  label: string;
  url: string;
}

export interface StackGroup {
  group: string;
  items: string[];
}

export interface Person {
  handle: string;
  github: string;
  githubUrl: string;
  name: string;
  headline: string | null;
  bio: string | null;
  stack: StackGroup[];
  links: PersonLink[];
  path: string;
  legacyPath: string;
}

export interface GithubProfile {
  avatarUrl: string;
  publicRepos: number | null;
  followers: number | null;
  joined: string | null;
}

export interface Registry {
  people: Person[];
  projects: Project[];
}
