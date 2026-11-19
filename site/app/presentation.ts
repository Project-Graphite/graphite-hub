import type { ProjectStatus } from './types';

export interface Feature {
  note: string;
  screenshot: string | null;
  posts: string[];
}

export const STATUSES: ProjectStatus[] = ['live', 'wip', 'archived', 'source-only'];

export const PROJECT_LIMITS = {
  name: { min: 2, max: 60 },
  summary: { min: 20, max: 240 },
  tags: 6,
  note: 600,
  posts: 3,
  problem: { min: 20, max: 500 },
  approach: { min: 20, max: 700 },
  outcome: { min: 20, max: 500 },
  contribution: { min: 20, max: 300 },
};
