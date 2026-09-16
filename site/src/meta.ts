import { personByHandle, projectBySlug } from './registry';

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

export function metaFor(path: string): PageMeta {
  if (path === '/') {
    return INDEX;
  }

  const [section, slug] = path.replace(/^\//, '').split('/');

  if (section === 'projects' && slug) {
    const project = projectBySlug(slug);
    if (project) {
      return {
        title: `${project.name} — ${SITE}`,
        description: project.summary,
        canonical: canonicalFor(project.path),
      };
    }
  }

  if (section === 'members' && slug) {
    const person = personByHandle(slug);
    if (!person) {
      return {
        title: `Not found — ${SITE}`,
        description: 'That page does not exist.',
        canonical: canonicalFor(path),
      };
    }
    return {
      title: `${person.name} — ${SITE}`,
      description:
        person.headline ?? person.bio ?? `Projects credited to ${person.name} on ${SITE}.`,
      canonical: canonicalFor(person.path),
    };
  }

  return {
    title: `Not found — ${SITE}`,
    description: 'That page does not exist.',
    canonical: canonicalFor(path),
  };
}
