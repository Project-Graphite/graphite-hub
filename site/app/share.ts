import type { Model } from './model';

export interface ShareCard {
  label: string;
  title: string;
  subtitle: string;
  accent: string;
}

const FIXED: Record<string, { label: string; title: string }> = {
  '/members': { label: 'members', title: 'The members of Project Graphite' },
  '/projects': { label: 'projects', title: 'Every project, with its own repository' },
  '/epics': { label: 'epics', title: 'Multi-project efforts' },
  '/changelog': { label: 'changelog', title: 'What changed, version by version' },
  '/status': { label: 'status', title: 'What is running right now' },
  '/messages': { label: 'messages', title: 'Leave a message for the members' },
  '/blog': { label: 'blog', title: 'Writing by the members' },
};

export function shareCard(
  model: Model,
  path: string,
  headline: string,
  accents: string[],
): ShareCard | undefined {
  const fixed = FIXED[path];
  if (path === '/') {
    return {
      label: 'project-graphite.com',
      title: headline,
      subtitle: `${model.members.length} members · ${model.projects.length} projects`,
      accent: accents[0],
    };
  }
  if (fixed) {
    return { ...fixed, subtitle: 'project-graphite.com', accent: accents[0] };
  }
  const post = model.posts.find((entry) => entry.path === path);
  if (post) {
    const writer = model.memberByHandle(post.author);
    return {
      label: writer ? `${writer.name} · ${post.readingMinutes} min read` : 'post',
      title: post.title,
      subtitle: post.summary || 'project-graphite.com',
      accent: writer?.accent ?? accents[0],
    };
  }
  const blogOf = path.match(/^(.+)\/blog$/)?.[1];
  const writer = blogOf ? model.resolve(blogOf).member : undefined;
  if (writer) {
    return {
      label: 'writing',
      title: `${writer.name} writes`,
      subtitle: `${model.postsBy(writer).length} posts`,
      accent: writer.accent,
    };
  }
  const { project, member } = model.resolve(path);
  if (member) {
    return {
      label: 'member',
      title: member.name,
      subtitle: member.headline ?? `@${member.github}`,
      accent: member.accent,
    };
  }
  if (project) {
    return {
      label: project.url?.replace('https://', '') ?? `${project.slug} · source only`,
      title: project.name,
      subtitle: project.summary,
      accent: model.memberByHandle(project.owner)?.accent ?? accents[0],
    };
  }
  return undefined;
}

export function shareHash(card: ShareCard) {
  let hash = 0x811c9dc5;
  for (const character of JSON.stringify(card)) {
    hash = Math.imul(hash ^ character.charCodeAt(0), 0x01000193);
  }
  return (hash >>> 0).toString(16);
}

export function sharePath(path: string, card: ShareCard) {
  return `/share${path === '/' ? '/home' : path}.png?v=${shareHash(card)}`;
}
