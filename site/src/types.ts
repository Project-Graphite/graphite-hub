export interface Service {
  name: string;
  route: string | null;
  port: number | null;
  size: string;
}

export interface TopologyData {
  kind: string;
  database: string;
  services: Service[];
}

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
  topology: TopologyData | null;
}

export interface PersonLink {
  label: string;
  url: string;
}

export interface Person {
  handle: string;
  github: string;
  githubUrl: string;
  name: string;
  headline: string | null;
  bio: string | null;
  links: PersonLink[];
  path: string;
}

export interface Registry {
  people: Person[];
  projects: Project[];
}
