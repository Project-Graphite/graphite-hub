import { changelogPath, memberByHandle, projectByRoute } from './registry';

const SITE = 'Project Graphite';
const ORIGIN = 'https://project-graphite.com';

function canonicalFor(path: string) {
  return path === '/' ? `${ORIGIN}/` : `${ORIGIN}${path}/`;
}

export interface PageMeta {
  title: string;
  description: string;
  canonical: string;
}

const INDEX: PageMeta = {
  title: SITE,
  description:
    'A shared portfolio for Project Graphite members, their work and the applications they deploy.',
  canonical: `${ORIGIN}/`,
};

export const MEMBERS: PageMeta = {
  title: `Members — ${SITE}`,
  description: 'The people building and maintaining every project in the registry.',
  canonical: `${ORIGIN}/members/`,
};

export const EPICS: PageMeta = {
  title: `Epics — ${SITE}`,
  description: 'Multi-project efforts, grouped under one ongoing initiative.',
  canonical: `${ORIGIN}/epics/`,
};

export const PROJECTS: PageMeta = {
  title: `Projects — ${SITE}`,
  description: 'Standalone projects — each with its own repository, independent of any epic.',
  canonical: `${ORIGIN}/projects/`,
};

export const CHANGELOG: PageMeta = {
  title: `Changelog — ${SITE}`,
  description:
    'What changed in every project, version by version — with the epic it belongs to and the member who owns it.',
  canonical: `${ORIGIN}/changelog/`,
};

export function metaFor(path: string): PageMeta {
  if (path === '/') {
    return INDEX;
  }

  if (path === '/members') {
    return MEMBERS;
  }

  if (path === '/epics') {
    return EPICS;
  }

  if (path === '/projects') {
    return PROJECTS;
  }

  if (path === '/changelog') {
    return CHANGELOG;
  }

  const changelog = path.startsWith('/changelog/');
  const [section, slug, childSlug] = path.replace(/^\/(changelog\/)?/, '').split('/');

  if ((section === 'projects' || section === 'epics') && slug) {
    const project = projectByRoute(childSlug ? slug : undefined, childSlug ?? slug);
    if (project && changelog) {
      return {
        title: `${project.name} changelog — ${SITE}`,
        description: `Every recorded release of ${project.name}.`,
        canonical: canonicalFor(changelogPath(project)),
      };
    }
    if (project) {
      return {
        title: `${project.name} — ${SITE}`,
        description: project.summary,
        canonical: canonicalFor(project.path),
      };
    }
  }

  if (section === 'members' && slug) {
    const member = memberByHandle(slug);
    if (member && changelog) {
      return {
        title: `${member.name} changelog — ${SITE}`,
        description: `Releases of the projects ${member.name} owns.`,
        canonical: canonicalFor(changelogPath(member)),
      };
    }
    if (member) {
      return {
        title: `${member.name} — ${SITE}`,
        description: member.headline ?? member.bio ?? member.name,
        canonical: canonicalFor(member.path),
      };
    }
  }

  return {
    title: `Not found — ${SITE}`,
    description: 'That page does not exist.',
    canonical: canonicalFor(path),
  };
}
