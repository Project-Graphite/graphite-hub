import type { Route } from './+types/llms';
import { modelFrom } from '../hub';
import { absolute, INDEX } from '../meta';
import { STATUS_LABEL } from '../model';
import type { Project } from '../types';

function projectLine(project: Project) {
  return [
    `- [${project.name}](${absolute(project.path)}): ${project.summary}`,
    project.url && project.status === 'live'
      ? ` Open it at ${project.url}.`
      : ` Status: ${STATUS_LABEL[project.status]}.`,
    ` Source: ${project.repoUrl}`,
  ].join('');
}

export function loader({ context }: Route.LoaderArgs) {
  const { members, projects, posts } = modelFrom(context);
  const body = [
    '# Project Graphite',
    '',
    `> ${INDEX.description}`,
    '',
    'Every project has its own repository. Live web apps run at their own subdomain of project-graphite.com and are open to use; source-only and in-progress work is labelled as such.',
    '',
    '## Live apps',
    '',
    ...projects.filter((project) => project.status === 'live').map(projectLine),
    '',
    '## Other projects',
    '',
    ...projects.filter((project) => project.status !== 'live').map(projectLine),
    '',
    '## Members',
    '',
    ...members.map(
      (member) =>
        `- [${member.name}](${absolute(member.path)}): ${member.headline ?? `@${member.github}`}`,
    ),
    '',
    ...(posts.length > 0
      ? [
          '## Writing',
          '',
          ...posts
            .slice(0, 20)
            .map((post) => `- [${post.title}](${absolute(post.path)}): ${post.summary}`),
          '',
        ]
      : []),
    '## Site',
    '',
    `- [Blog](${absolute('/blog')}): posts by the members, with RSS at ${absolute('/blog/feed.xml')}`,
    `- [Subscribe](${absolute('/subscribe')}): new posts by email, per post or as a weekly digest`,
    `- [Changelog](${absolute('/changelog')}): every release of every project`,
    `- [Sitemap](${absolute('/sitemap.xml')}): every page on the site`,
    '',
  ].join('\n');
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
