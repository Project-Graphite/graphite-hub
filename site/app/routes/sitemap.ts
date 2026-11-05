import type { Route } from './+types/sitemap';
import { modelFrom } from '../hub';
import { ORIGIN } from '../meta';
import { changelogPath } from '../model';

export function loader({ context }: Route.LoaderArgs) {
  const { members, projects } = modelFrom(context);
  const paths = [
    '/',
    '/members',
    '/epics',
    '/projects',
    ...members.map((member) => member.path),
    ...projects.map((project) => project.path),
    '/changelog',
    '/status',
    '/privacy',
    ...members.map(changelogPath),
    ...projects.map(changelogPath),
  ];
  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...paths.map((path) => `  <url><loc>${ORIGIN}${path === '/' ? path : `${path}/`}</loc></url>`),
    '</urlset>',
    '',
  ].join('\n');
  return new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
}
