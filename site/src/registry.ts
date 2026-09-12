import data from './data/registry.json';
import type { Person, Project, Registry } from './types';

const registry = data as Registry;

export const people: Person[] = registry.people;
export const projects: Project[] = registry.projects;

export const routePaths: string[] = [
  '/',
  ...people.map((person) => person.path),
  ...projects.map((project) => project.path),
];

export function personByHandle(handle: string): Person | undefined {
  return people.find((person) => person.handle === handle);
}

export function personByGithub(github: string): Person | undefined {
  return people.find((person) => person.github.toLowerCase() === github.toLowerCase());
}

export function projectsOwnedBy(handle: string): Project[] {
  return projects.filter((project) => project.owner === handle);
}

export function projectByPath(handle: string, slug: string): Project | undefined {
  return projects.find((project) => project.owner === handle && project.slug === slug);
}
