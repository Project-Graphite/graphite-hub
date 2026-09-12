import { personByHandle, projectByPath } from './registry';

const SITE = 'Project Graphite';
const ORIGIN = 'https://project-graphite.com';

export interface PageMeta {
  title: string;
  description: string;
  canonical: string;
}

const INDEX: PageMeta = {
  title: SITE,
  description:
    'Projects built and deployed under one roof, each with its own repository, subdomain and running deployment.',
  canonical: `${ORIGIN}/`,
};

export function metaFor(path: string): PageMeta {
  if (path === '/') {
    return INDEX;
  }

  const [handle, slug] = path.replace(/^\//, '').split('/');

  if (slug) {
    const project = projectByPath(handle, slug);
    if (project) {
      return {
        title: `${project.name} — ${SITE}`,
        description: project.summary,
        canonical: `${ORIGIN}${project.path}`,
      };
    }
  }

  const person = personByHandle(handle);
  if (person) {
    return {
      title: `${person.name} — ${SITE}`,
      description:
        person.headline ?? person.bio ?? `Projects listed under ${person.name} on ${SITE}.`,
      canonical: `${ORIGIN}${person.path}`,
    };
  }

  return {
    title: `Not found — ${SITE}`,
    description: 'That page does not exist.',
    canonical: `${ORIGIN}${path}`,
  };
}
