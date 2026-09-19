import { memberByHandle, projectByRoute } from './registry';

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

const MEMBERS: PageMeta = {
  title: `Members — ${SITE}`,
  description: 'The people building and maintaining every project in the registry.',
  canonical: `${ORIGIN}/members/`,
};

const EPICS: PageMeta = {
  title: `Epics — ${SITE}`,
  description: 'Multi-project efforts, grouped under one ongoing initiative.',
  canonical: `${ORIGIN}/epics/`,
};

const PROJECTS: PageMeta = {
  title: `Projects — ${SITE}`,
  description: 'Standalone projects — each with its own repository, independent of any epic.',
  canonical: `${ORIGIN}/projects/`,
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

  const [section, slug, childSlug] = path.replace(/^\//, '').split('/');

  if ((section === 'projects' || section === 'epics') && slug) {
    const project = projectByRoute(childSlug ? slug : undefined, childSlug ?? slug);
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
    if (!member) {
      return {
        title: `Not found — ${SITE}`,
        description: 'That page does not exist.',
        canonical: canonicalFor(path),
      };
    }
    return {
      title: `${member.name} — ${SITE}`,
      description: member.headline ?? member.bio ?? member.name,
      canonical: canonicalFor(member.path),
    };
  }

  return {
    title: `Not found — ${SITE}`,
    description: 'That page does not exist.',
    canonical: canonicalFor(path),
  };
}
