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
  url: string | null;
  path: string;
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
}

export interface GithubProfile {
  avatarUrl: string;
  publicRepos: number;
  followers: number;
  joined: string;
}

export interface Registry {
  people: Person[];
  projects: Project[];
}
