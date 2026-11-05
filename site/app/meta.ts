import type { MetaDescriptor } from 'react-router';
import { changelogPath, type Model } from './model';

export const SITE = 'Project Graphite';
export const ORIGIN = 'https://project-graphite.com';

function canonicalFor(path: string) {
  return path === '/' ? `${ORIGIN}/` : `${ORIGIN}${path}/`;
}

export interface PageMeta {
  title: string;
  description: string;
  canonical: string;
}

export const INDEX: PageMeta = {
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

const NOT_FOUND = (path: string): PageMeta => ({
  title: `Not found — ${SITE}`,
  description: 'That page does not exist.',
  canonical: canonicalFor(path),
});

export function metaFor(model: Model | undefined, rawPath: string): PageMeta {
  const path = rawPath.replace(/(.)\/$/, '$1');
  const fixed: Record<string, PageMeta> = {
    '/': INDEX,
    '/members': MEMBERS,
    '/epics': EPICS,
    '/projects': PROJECTS,
    '/changelog': CHANGELOG,
  };
  if (fixed[path]) {
    return fixed[path];
  }
  if (!model) {
    return NOT_FOUND(path);
  }

  const changelog = path.startsWith('/changelog/');
  const [section, slug, childSlug] = path.replace(/^\/(changelog\/)?/, '').split('/');

  if ((section === 'projects' || section === 'epics') && slug) {
    const project = model.projectByRoute(childSlug ? slug : undefined, childSlug ?? slug);
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
    const member = model.memberByHandle(slug);
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

  return NOT_FOUND(path);
}

export function metaTags({ title, description, canonical }: PageMeta): MetaDescriptor[] {
  return [
    { title },
    { name: 'description', content: description },
    { tagName: 'link', rel: 'canonical', href: canonical },
    { property: 'og:title', content: title },
    { property: 'og:description', content: description },
    { property: 'og:url', content: canonical },
    { property: 'og:type', content: 'website' },
    { property: 'og:site_name', content: SITE },
    { name: 'twitter:card', content: 'summary' },
  ];
}
