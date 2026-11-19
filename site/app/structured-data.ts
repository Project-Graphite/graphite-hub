import { absolute, INDEX, ORIGIN, SITE, type PageMeta } from './meta.ts';
import { changelogPath, type Model } from './model.ts';
import type { Member, Project } from './types';

type Node = Record<string, unknown>;

const ORGANIZATION = `${ORIGIN}/#organization`;
const WEBSITE = `${ORIGIN}/#website`;
const BLOG = `${absolute('/blog')}#blog`;

const organization: Node = {
  '@type': 'Organization',
  '@id': ORGANIZATION,
  name: SITE,
  url: absolute('/'),
  logo: absolute('/apple-touch-icon.png'),
  sameAs: ['https://github.com/Project-Graphite'],
};

function person(member: Member): Node {
  return {
    '@type': 'Person',
    '@id': `${absolute(member.path)}#person`,
    name: member.name,
    url: absolute(member.path),
  };
}

function breadcrumbs(trail: [name: string, path: string][]): Node {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: [[SITE, '/'] as const, ...trail].map(([name, path], index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name,
      item: absolute(path),
    })),
  };
}

function projectTrail(model: Model, project: Project): [string, string][] {
  const parent = project.parent ? model.projectBySlug(project.parent) : undefined;
  return [
    project.kind === 'epic' || parent ? ['Epics', '/epics'] : ['Projects', '/projects'],
    ...(parent ? [[parent.name, parent.path] as [string, string]] : []),
    [project.name, project.path],
  ];
}

function projectNodes(model: Model, project: Project, image: string | undefined): Node[] {
  const page = absolute(project.path);
  const owner = model.memberByHandle(project.owner);
  const latest = model.releasesForProject(project)[0];
  const authors = [
    ...new Set([owner, ...project.authors.map((login) => model.memberByGithub(login))]),
  ].flatMap((member) => (member ? [person(member)] : []));
  const shared = {
    name: project.name,
    description: project.summary,
    ...(authors.length > 0 && { author: authors }),
    ...(project.tags.length > 0 && { keywords: project.tags.join(', ') }),
    ...(image && { image }),
  };
  const app = project.status === 'live' && project.url ? `${page}#app` : undefined;
  return [
    {
      '@type': 'SoftwareSourceCode',
      '@id': `${page}#source`,
      ...shared,
      url: page,
      codeRepository: project.repoUrl,
      ...(owner && { maintainer: person(owner) }),
      ...(latest && { version: latest.version, dateModified: latest.date }),
      ...(app && { targetProduct: { '@id': app } }),
      ...(project.kind === 'epic' && {
        hasPart: model.childProjects(project.slug).map((child) => ({
          '@type': 'SoftwareSourceCode',
          '@id': `${absolute(child.path)}#source`,
          name: child.name,
          url: absolute(child.path),
        })),
      }),
    },
    ...(app
      ? [
          {
            '@type': 'WebApplication',
            '@id': app,
            ...shared,
            url: project.url,
            mainEntityOfPage: page,
            isAccessibleForFree: true,
            offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
            releaseNotes: absolute(changelogPath(project)),
            ...(latest && { softwareVersion: latest.version, dateModified: latest.date }),
          },
        ]
      : []),
    breadcrumbs(projectTrail(model, project)),
  ];
}

function nodes(model: Model, page: PageMeta, image: string | undefined): Node[] {
  const subject = page.subject;
  switch (subject?.kind) {
    case 'home':
      return [
        {
          ...organization,
          description: INDEX.description,
          member: model.members.map(person),
        },
        {
          '@type': 'WebSite',
          '@id': WEBSITE,
          name: SITE,
          url: absolute('/'),
          description: INDEX.description,
          inLanguage: 'en',
          publisher: { '@id': ORGANIZATION },
        },
      ];
    case 'member': {
      const { member } = subject;
      return [
        {
          '@type': 'ProfilePage',
          '@id': page.canonical,
          url: page.canonical,
          name: page.title,
          description: page.description,
          isPartOf: { '@type': 'WebSite', '@id': WEBSITE, name: SITE, url: absolute('/') },
          mainEntity: {
            ...person(member),
            alternateName: member.github,
            description: page.description,
            image: new URL(member.avatarUrl, ORIGIN).href,
            sameAs: [`https://github.com/${member.github}`],
            memberOf: organization,
          },
        },
        breadcrumbs([
          ['Members', '/members'],
          [member.name, member.path],
        ]),
      ];
    }
    case 'project':
      return projectNodes(model, subject.project, image);
    case 'post': {
      const { post, writer } = subject;
      const about = post.project ? model.projectBySlug(post.project) : undefined;
      return [
        {
          '@type': 'BlogPosting',
          '@id': `${page.canonical}#post`,
          mainEntityOfPage: page.canonical,
          url: page.canonical,
          headline: post.title,
          description: page.description,
          datePublished: post.publishedAt,
          dateModified: post.updatedAt,
          inLanguage: 'en',
          timeRequired: `PT${post.readingMinutes}M`,
          ...(writer && { author: person(writer) }),
          publisher: organization,
          ...(image && { image }),
          ...(post.tags.length > 0 && { keywords: post.tags.join(', ') }),
          ...(about && {
            about: { '@id': `${absolute(about.path)}#source`, name: about.name },
          }),
          isPartOf: { '@type': 'Blog', '@id': BLOG, name: 'Writing', url: absolute('/blog') },
        },
        breadcrumbs([
          ['Writing', '/blog'],
          ...(writer ? [[writer.name, `${writer.path}/blog`] as [string, string]] : []),
          [post.title, post.path],
        ]),
      ];
    }
    case 'writing':
      return [
        breadcrumbs([
          ['Writing', '/blog'],
          [subject.member.name, `${subject.member.path}/blog`],
        ]),
      ];
    case 'changelog':
      return [
        breadcrumbs([
          ['Changelog', '/changelog'],
          [subject.of.name, changelogPath(subject.of)],
        ]),
      ];
    default:
      return [];
  }
}

export function structuredData(model: Model, page: PageMeta, image: string | undefined) {
  const graph = page.noindex ? [] : nodes(model, page, image);
  return graph.length > 0 ? { '@context': 'https://schema.org', '@graph': graph } : undefined;
}
