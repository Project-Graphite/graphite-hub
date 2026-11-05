import type { Route } from './+types/llms';
import { modelFrom } from '../hub';
import { INDEX, ORIGIN } from '../meta';
import { STATUS_LABEL } from '../model';
import type { Project } from '../types';

function projectLine(project: Project) {
  return [
    `- [${project.name}](${ORIGIN}${project.path}/): ${project.summary}`,
    project.url && project.status === 'live'
      ? ` Open it at ${project.url}.`
      : ` Status: ${STATUS_LABEL[project.status]}.`,
    ` Source: ${project.repoUrl}`,
  ].join('');
}

export function loader({ context }: Route.LoaderArgs) {
  const { members, projects } = modelFrom(context);
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
        `- [${member.name}](${ORIGIN}${member.path}/): ${member.headline ?? `@${member.github}`}`,
    ),
    '',
    '## Site',
    '',
    `- [Changelog](${ORIGIN}/changelog/): every release of every project`,
    `- [Sitemap](${ORIGIN}/sitemap.xml): every page on the site`,
    '',
  ].join('\n');
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
