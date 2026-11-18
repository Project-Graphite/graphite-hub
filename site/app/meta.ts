import type { MetaDescriptor } from 'react-router';
import { changelogPath, type Model } from './model.ts';
import type { PostSummary } from './posts';
import type { Member, Project } from './types';

export const SITE = 'Project Graphite';
export const ORIGIN = 'https://project-graphite.com';
export const BUILT_AT = new Date().toISOString();

const DESCRIPTION_MAX = 160;

export function absolute(path: string) {
  return `${ORIGIN}${path}`;
}

export type Subject =
  | { kind: 'home' }
  | { kind: 'post'; post: PostSummary; writer: Member | undefined }
  | { kind: 'writing'; member: Member }
  | { kind: 'changelog'; of: Project | Member }
  | { kind: 'project'; project: Project }
  | { kind: 'member'; member: Member };

export interface PageMeta {
  title: string;
  description: string;
  canonical: string;
  noindex?: boolean;
  type?: 'website' | 'article' | 'profile';
  extra?: MetaDescriptor[];
  subject?: Subject;
}

export const INDEX: PageMeta = {
  title: SITE,
  description:
    'A shared portfolio for Project Graphite members, their work and the applications they deploy.',
  canonical: absolute('/'),
};

export const MEMBERS: PageMeta = {
  title: `Members — ${SITE}`,
  description: 'The people building and maintaining every project in the registry.',
  canonical: absolute('/members'),
};

export const EPICS: PageMeta = {
  title: `Epics — ${SITE}`,
  description: 'Multi-project efforts, grouped under one ongoing initiative.',
  canonical: absolute('/epics'),
};

export const PROJECTS: PageMeta = {
  title: `Projects — ${SITE}`,
  description: 'Standalone projects — each with its own repository, independent of any epic.',
  canonical: absolute('/projects'),
};

export const CHANGELOG: PageMeta = {
  title: `Changelog — ${SITE}`,
  description:
    'What changed in every project, version by version — with the epic it belongs to and the member who owns it.',
  canonical: absolute('/changelog'),
};

export const STATUS: PageMeta = {
  title: `Status — ${SITE}`,
  description: 'Every live project, its uptime over the last thirty days, and what just happened.',
  canonical: absolute('/status'),
};

export const notFound = (path: string): PageMeta => ({
  title: `Not found — ${SITE}`,
  description: 'That page does not exist.',
  canonical: absolute(path),
  noindex: true,
});

export const broken = (path: string): PageMeta => ({
  title: `Something broke — ${SITE}`,
  description: 'The page could not be rendered.',
  canonical: absolute(path),
  noindex: true,
});

function clip(text: string) {
  const line = text.replace(/\s+/g, ' ').trim();
  return line.length <= DESCRIPTION_MAX
    ? line
    : `${line.slice(0, DESCRIPTION_MAX).replace(/\s+\S*$/, '')}…`;
}

function enumerate(names: string[]) {
  return names.length > 3
    ? `${names.slice(0, 3).join(', ')} and ${names.length - 3} more`
    : names.join(', ').replace(/, ([^,]+)$/, ' and $1');
}

export function describeMember(model: Model, member: Member) {
  const builds = [...model.epicsForMember(member), ...model.projectsForMember(member)].map(
    (project) => project.name,
  );
  const lead = (member.headline ?? member.bio)?.trim().replace(/[.\s]+$/, '');
  if (!lead) {
    return clip(
      `${member.name} ${builds.length > 0 ? `builds ${enumerate(builds)} at ${SITE}` : `is a member of ${SITE}`}.`,
    );
  }
  return clip(
    `${lead}. ${builds.length > 0 ? `Builds ${enumerate(builds)} at ${SITE}` : `A member of ${SITE}`}.`,
  );
}

export function metaFor(model: Model | undefined, rawPath: string, headline: string): PageMeta {
  const path = rawPath.replace(/(.)\/$/, '$1');
  const fixed: Record<string, PageMeta> = {
    '/': {
      ...INDEX,
      title: `${SITE} — ${headline.trim().replace(/\.$/, '')}`,
      subject: { kind: 'home' },
    },
    '/members': MEMBERS,
    '/epics': EPICS,
    '/projects': PROJECTS,
    '/changelog': CHANGELOG,
    '/status': STATUS,
    '/messages': {
      title: `Messages — ${SITE}`,
      description: 'Leave a message for the members of Project Graphite.',
      canonical: absolute('/messages'),
    },
    '/search': {
      title: `Search — ${SITE}`,
      description: 'Search members, projects and releases.',
      canonical: absolute('/search'),
      noindex: true,
    },
    '/subscribe': {
      title: `Subscribe — ${SITE}`,
      description: 'New writing by email: every post as it publishes, or a weekly digest.',
      canonical: absolute('/subscribe'),
    },
    '/privacy': {
      title: `Privacy — ${SITE}`,
      description: 'What Project Graphite keeps, and for how long.',
      canonical: absolute('/privacy'),
    },
    '/admin': {
      title: `Admin — ${SITE}`,
      description: 'Site settings and errors.',
      canonical: absolute('/admin'),
      noindex: true,
    },
    '/kit': {
      title: `Kit — ${SITE}`,
      description: 'Every piece of the kit on one page.',
      canonical: absolute('/kit'),
      noindex: true,
    },
    '/blog': {
      title: `Writing — ${SITE}`,
      description: 'Posts by the members of Project Graphite.',
      canonical: absolute('/blog'),
    },
    '/blog/new': {
      title: `New post — ${SITE}`,
      description: 'Start a post from a template.',
      canonical: absolute('/blog/new'),
      noindex: true,
    },
    '/blog/mine': {
      title: `Your posts — ${SITE}`,
      description: 'Drafts, scheduled and published posts.',
      canonical: absolute('/blog/mine'),
      noindex: true,
    },
  };
  if (fixed[path]) {
    return fixed[path];
  }
  if (path.startsWith('/subscribe/')) {
    return {
      title: `Your subscription — ${SITE}`,
      description: 'What you get by email, and how to stop.',
      canonical: absolute('/subscribe'),
      noindex: true,
    };
  }
  if (!model) {
    return notFound(path);
  }

  if (/^\/blog\/[^/]+\/edit$/.test(path)) {
    return {
      title: `Writing a post — ${SITE}`,
      description: 'The post editor.',
      canonical: absolute('/blog'),
      noindex: true,
    };
  }
  const post = model.posts.find((entry) => entry.path === path);
  if (post) {
    const writer = model.memberByHandle(post.author);
    return {
      title: `${post.title} — ${SITE}`,
      description: post.summary || `A post by ${writer?.name ?? post.author}.`,
      canonical: absolute(post.path),
      type: 'article',
      extra: [
        { property: 'article:published_time', content: post.publishedAt },
        { property: 'article:modified_time', content: post.updatedAt },
        ...(writer ? [{ property: 'article:author', content: absolute(writer.path) }] : []),
        ...post.tags.map((tag) => ({ property: 'article:tag', content: tag })),
      ],
      subject: { kind: 'post', post, writer },
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
      canonical: absolute(`${writer.path}/blog`),
      subject: { kind: 'writing', member: writer },
    };
  }

  if (path.startsWith('/changelog/')) {
    const logged = model.changelogOf(path);
    return logged
      ? {
          title: `${logged.name} changelog — ${SITE}`,
          description:
            'handle' in logged
              ? `Releases of the projects ${logged.name} owns.`
              : `Every recorded release of ${logged.name}.`,
          canonical: absolute(changelogPath(logged)),
          subject: { kind: 'changelog', of: logged },
        }
      : notFound(path);
  }

  if (path.endsWith('/edit')) {
    const base = path.slice(0, -'/edit'.length);
    const handle = base.match(/^\/members\/([^/]+)$/)?.[1];
    const member = handle ? model.memberByHandle(handle) : model.resolve(base).member;
    if (member) {
      return {
        title: `Editing ${member.name} — ${SITE}`,
        description: `The editor for ${member.name}'s page.`,
        canonical: absolute(member.path),
        noindex: true,
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
      canonical: absolute(project.path),
      subject: { kind: 'project', project },
    };
  }
  if (member) {
    return {
      title: `${member.name} — ${SITE}`,
      description: describeMember(model, member),
      canonical: absolute(member.path),
      type: 'profile',
      extra: [{ property: 'profile:username', content: member.github }],
      subject: { kind: 'member', member },
    };
  }
  return notFound(path);
}

export function metaTags(
  { title, description, canonical, noindex, type = 'website', extra = [] }: PageMeta,
  image: { path: string; alt: string } | undefined,
): MetaDescriptor[] {
  return [
    { title },
    { name: 'description', content: description },
    noindex
      ? { name: 'robots', content: 'noindex' }
      : { tagName: 'link', rel: 'canonical', href: canonical },
    { property: 'og:title', content: title },
    { property: 'og:description', content: description },
    { property: 'og:url', content: canonical },
    { property: 'og:type', content: type },
    { property: 'og:site_name', content: SITE },
    { property: 'og:locale', content: 'en_GB' },
    ...extra,
    ...(image
      ? [
          { property: 'og:image', content: absolute(image.path) },
          { property: 'og:image:width', content: '1200' },
          { property: 'og:image:height', content: '630' },
          { property: 'og:image:alt', content: image.alt },
          { name: 'twitter:card', content: 'summary_large_image' },
        ]
      : [{ name: 'twitter:card', content: 'summary' }]),
  ];
}
