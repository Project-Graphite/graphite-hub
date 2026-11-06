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

export const STATUS: PageMeta = {
  title: `Status — ${SITE}`,
  description: 'Every live project, its uptime over the last thirty days, and what just happened.',
  canonical: `${ORIGIN}/status/`,
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
    '/status': STATUS,
    '/messages': {
      title: `Messages — ${SITE}`,
      description: 'Leave a message for the members of Project Graphite.',
      canonical: `${ORIGIN}/messages/`,
    },
    '/search': {
      title: `Search — ${SITE}`,
      description: 'Search members, projects and releases.',
      canonical: `${ORIGIN}/search/`,
    },
    '/privacy': {
      title: `Privacy — ${SITE}`,
      description: 'What Project Graphite keeps, and for how long.',
      canonical: `${ORIGIN}/privacy/`,
    },
    '/sign-in': {
      title: `Sign in — ${SITE}`,
      description: 'Members sign in with GitHub.',
      canonical: `${ORIGIN}/sign-in/`,
    },
    '/admin': {
      title: `Admin — ${SITE}`,
      description: 'Site settings and errors.',
      canonical: `${ORIGIN}/admin/`,
    },
    '/blog': {
      title: `Writing — ${SITE}`,
      description: 'Posts by the members of Project Graphite.',
      canonical: `${ORIGIN}/blog/`,
    },
    '/blog/new': {
      title: `New post — ${SITE}`,
      description: 'Start a post from a template.',
      canonical: `${ORIGIN}/blog/new/`,
    },
    '/blog/mine': {
      title: `Your posts — ${SITE}`,
      description: 'Drafts, scheduled and published posts.',
      canonical: `${ORIGIN}/blog/mine/`,
    },
  };
  if (fixed[path]) {
    return fixed[path];
  }
  if (!model) {
    return NOT_FOUND(path);
  }

  if (/^\/blog\/[^/]+\/edit$/.test(path)) {
    return {
      title: `Writing a post — ${SITE}`,
      description: 'The post editor.',
      canonical: `${ORIGIN}/blog/`,
    };
  }
  const post = model.posts.find((entry) => entry.path === path);
  if (post) {
    const writer = model.memberByHandle(post.author);
    return {
      title: `${post.title} — ${SITE}`,
      description: post.summary || `A post by ${writer?.name ?? post.author}.`,
      canonical: canonicalFor(post.path),
    };
  }
  const blogOf = path.match(/^(.+)\/blog$/)?.[1];
  const writer = blogOf
    ? blogOf.match(/^\/members\/([^/]+)$/)?.[1]
      ? model.memberByHandle(blogOf.split('/')[2])
      : model.resolve(blogOf).member
    : undefined;
  if (writer) {
    return {
      title: `${writer.name} writes — ${SITE}`,
      description: `Posts by ${writer.name}.`,
      canonical: canonicalFor(`${writer.path}/blog`),
    };
  }

  if (path.startsWith('/changelog/')) {
    const [section, slug, childSlug] = path.slice('/changelog/'.length).split('/');
    const project =
      (section === 'projects' || section === 'epics') && slug
        ? model.projectByRoute(childSlug ? slug : undefined, childSlug ?? slug)
        : undefined;
    const member = section === 'members' && slug ? model.memberByHandle(slug) : undefined;
    if (project) {
      return {
        title: `${project.name} changelog — ${SITE}`,
        description: `Every recorded release of ${project.name}.`,
        canonical: canonicalFor(changelogPath(project)),
      };
    }
    if (member) {
      return {
        title: `${member.name} changelog — ${SITE}`,
        description: `Releases of the projects ${member.name} owns.`,
        canonical: canonicalFor(changelogPath(member)),
      };
    }
    return NOT_FOUND(path);
  }

  if (path.endsWith('/edit')) {
    const base = path.slice(0, -'/edit'.length);
    const handle = base.match(/^\/members\/([^/]+)$/)?.[1];
    const member = handle ? model.memberByHandle(handle) : model.resolve(base).member;
    if (member) {
      return {
        title: `Editing ${member.name} — ${SITE}`,
        description: `The editor for ${member.name}'s page.`,
        canonical: canonicalFor(member.path),
      };
    }
  }

  const handle = path.match(/^\/members\/([^/]+)$/)?.[1];
  const { project, member } = handle
    ? { project: undefined, member: model.memberByHandle(handle) }
    : model.resolve(path);
  if (project) {
    return {
      title: `${project.name} — ${SITE}`,
      description: project.summary,
      canonical: canonicalFor(project.path),
    };
  }
  if (member) {
    return {
      title: `${member.name} — ${SITE}`,
      description: member.headline ?? member.bio ?? member.name,
      canonical: canonicalFor(member.path),
    };
  }
  return NOT_FOUND(path);
}

export function metaTags(
  { title, description, canonical }: PageMeta,
  image: string | undefined,
): MetaDescriptor[] {
  return [
    { title },
    { name: 'description', content: description },
    { tagName: 'link', rel: 'canonical', href: canonical },
    { property: 'og:title', content: title },
    { property: 'og:description', content: description },
    { property: 'og:url', content: canonical },
    { property: 'og:type', content: 'website' },
    { property: 'og:site_name', content: SITE },
    ...(image
      ? [
          { property: 'og:image', content: `${ORIGIN}${image}` },
          { property: 'og:image:width', content: '1200' },
          { property: 'og:image:height', content: '630' },
          { name: 'twitter:card', content: 'summary_large_image' },
        ]
      : [{ name: 'twitter:card', content: 'summary' }]),
  ];
}
