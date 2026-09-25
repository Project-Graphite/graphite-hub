import githubData from './data/github.json';
import data from './data/registry.json';
import type { GithubProfile, Member, Project, Registry } from './types';

const registry = data as Registry;

export const members: Member[] = registry.members;
export const projects: Project[] = registry.projects;
export const rootProjects: Project[] = projects.filter(
  (project) => project.kind === 'project' && !project.parent,
);
export const epics: Project[] = projects.filter((project) => project.kind === 'epic');
export const githubProfiles = githubData as Record<string, GithubProfile>;

export const routePaths: string[] = [
  '/',
  '/members',
  '/epics',
  '/projects',
  ...members.map((member) => member.path),
  ...projects.map((project) => project.path),
];

export function memberByHandle(handle: string): Member | undefined {
  return members.find((member) => member.handle.toLowerCase() === handle.toLowerCase());
}

export function memberByGithub(github: string): Member | undefined {
  return members.find((member) => member.github.toLowerCase() === github.toLowerCase());
}

export function avatarFor(member: Member) {
  return (
    githubProfiles[member.github]?.avatarUrl ?? `https://github.com/${member.github}.png?size=128`
  );
}

function isCredited(project: Project, member: Member) {
  return (
    project.owner === member.handle ||
    project.authors.some((author) => author.toLowerCase() === member.github.toLowerCase())
  );
}

export function projectsForMember(member: Member): Project[] {
  return rootProjects.filter((project) => isCredited(project, member));
}

export function epicsForMember(member: Member): Project[] {
  return epics.filter(
    (epic) =>
      isCredited(epic, member) ||
      childProjects(epic.slug).some((project) => isCredited(project, member)),
  );
}

export function contributionForMember(project: Project, member: Member) {
  return project.showcase?.contributions.find(
    (contribution) => contribution.github.toLowerCase() === member.github.toLowerCase(),
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
