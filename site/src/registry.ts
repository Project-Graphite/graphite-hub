import githubData from './data/github.json';
import data from './data/registry.json';
import type { GithubProfile, Person, Project, Registry } from './types';

const registry = data as Registry;

export const people: Person[] = registry.people;
export const projects: Project[] = registry.projects;
export const rootProjects: Project[] = projects.filter(
  (project) => project.kind === 'project' && !project.parent,
);
export const epics: Project[] = projects.filter((project) => project.kind === 'epic');
export const githubProfiles = githubData as Record<string, GithubProfile>;

export const routePaths: string[] = [
  '/',
  ...people.map((person) => person.path),
  ...projects.map((project) => project.path),
];

export const legacyRedirects: Array<{ from: string; to: string }> = [
  ...people.map((person) => ({ from: person.legacyPath, to: person.path })),
  ...projects.map((project) => ({ from: project.legacyPath, to: project.path })),
];

export function personByHandle(handle: string): Person | undefined {
  return people.find((person) => person.handle === handle);
}

export function personByGithub(github: string): Person | undefined {
  return people.find((person) => person.github.toLowerCase() === github.toLowerCase());
}

export function projectsForPerson(person: Person): Project[] {
  return projects.filter(
    (project) =>
      project.kind === 'project' &&
      (project.owner === person.handle ||
        project.authors.some((author) => author.toLowerCase() === person.github.toLowerCase())),
  );
}

export function epicsForPerson(person: Person): Project[] {
  return epics.filter(
    (epic) =>
      epic.owner === person.handle ||
      epic.authors.some((author) => author.toLowerCase() === person.github.toLowerCase()),
  );
}

export function contributionForPerson(project: Project, person: Person) {
  return project.showcase?.contributions.find(
    (contribution) => contribution.github.toLowerCase() === person.github.toLowerCase(),
  );
}

export function projectBySlug(slug: string): Project | undefined {
  return projects.find((project) => project.slug === slug);
}

export function projectByRoute(parent: string | undefined, slug: string): Project | undefined {
  return projects.find((project) => project.parent === (parent ?? null) && project.slug === slug);
}

export function childProjects(parent: string): Project[] {
  return projects.filter((project) => project.parent === parent);
}

export function legacyProject(handle: string, slug: string): Project | undefined {
  return projects.find((project) => project.owner === handle && project.slug === slug);
}
