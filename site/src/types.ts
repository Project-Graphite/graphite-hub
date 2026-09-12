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
  authors: string[];
  status: string;
  featured: boolean;
  url: string | null;
  topology: TopologyData | null;
}
