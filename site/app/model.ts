import type { Directory, Member, Project, ProjectStatus, Release } from './types';

export const STATUS_LABEL: Record<ProjectStatus, string> = {
  live: 'live',
  wip: 'in progress',
  archived: 'archived',
  'source-only': 'source only',
};

export function changelogPath(entry: Project | Member) {
  if ('handle' in entry) {
    return `/changelog/members/${entry.handle}`;
  }
  if (entry.parent) {
    return `/changelog/epics/${entry.parent}/${entry.slug}`;
  }
  return `/changelog/${entry.kind === 'epic' ? 'epics' : 'projects'}/${entry.slug}`;
}

export function compareUrl(project: Project, release: Release) {
  if (!release.tag) {
    return `${project.repoUrl}/commits`;
  }
  return release.previous
    ? `${project.repoUrl}/compare/${release.previous}...${release.tag}`
    : `${project.repoUrl}/commits/${release.tag}`;
}

export function createModel({ members, projects, releases }: Directory) {
  const rootProjects = projects.filter((project) => project.kind === 'project' && !project.parent);
  const epics = projects.filter((project) => project.kind === 'epic');

  const memberByHandle = (handle: string): Member | undefined =>
    members.find((member) => member.handle.toLowerCase() === handle.toLowerCase());

  const memberByGithub = (github: string): Member | undefined =>
    members.find((member) => member.github.toLowerCase() === github.toLowerCase());

  const projectBySlug = (slug: string): Project | undefined =>
    projects.find((project) => project.slug === slug);

  const projectByRoute = (parent: string | undefined, slug: string): Project | undefined =>
    projects.find((project) => project.parent === (parent ?? null) && project.slug === slug);

  const childProjects = (parent: string): Project[] =>
    projects.filter((project) => project.parent === parent);

  const isCredited = (project: Project, member: Member) =>
    project.owner === member.handle ||
    project.authors.some((author) => author.toLowerCase() === member.github.toLowerCase());

  const releasesForProject = (project: Project): Release[] => {
    const slugs = new Set([
      project.slug,
      ...childProjects(project.slug).map((child) => child.slug),
    ]);
    return releases.filter((release) => slugs.has(release.project));
  };

  const projectsOwnedBy = (member: Member): Project[] =>
    projects.filter((project) => project.owner === member.handle);

  return {
    members: members.filter((member) => member.listed),
    projects,
    releases,
    rootProjects,
    epics,
    memberByHandle,
    memberByGithub,
    isCredited,
    resolve: (path: string): { project?: Project; member?: Member } => {
      const project = projects.find((entry) => entry.path === path);
      const member = project ? undefined : members.find((entry) => entry.path === path);
      if (project || member) {
        return { project, member };
      }
      const [alias, slug, extra] = path.split('/').filter(Boolean);
      const scoped = members.find((entry) => entry.alias !== null && entry.alias === alias);
      const owned = slug && !extra ? projectByRoute(undefined, slug) : undefined;
      return scoped && owned && isCredited(owned, scoped) ? { project: owned } : {};
    },
    projectBySlug,
    projectByRoute,
    childProjects,
    releasesForProject,
    projectsOwnedBy,
    projectsForMember: (member: Member) =>
      rootProjects.filter((project) => isCredited(project, member)),
    epicsForMember: (member: Member) =>
      epics.filter(
        (epic) =>
          isCredited(epic, member) ||
          childProjects(epic.slug).some((project) => isCredited(project, member)),
      ),
    contributionForMember: (project: Project, member: Member) =>
      project.showcase?.contributions.find(
        (contribution) => contribution.github.toLowerCase() === member.github.toLowerCase(),
      ),
    lastPublishedOn: (project: Project) => releasesForProject(project)[0]?.date ?? '',
    releasesOwnedBy: (member: Member) => {
      const slugs = new Set(projectsOwnedBy(member).map((project) => project.slug));
      return releases.filter((release) => slugs.has(release.project));
    },
  };
}

export type Model = ReturnType<typeof createModel>;
