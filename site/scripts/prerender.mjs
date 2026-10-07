import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const DIST = 'dist';
const OPEN = '<!--head-->';
const CLOSE = '<!--/head-->';

const escape = (value) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const head = ({ title, description, canonical }) =>
  [
    `<title>${escape(title)}</title>`,
    `<meta name="description" content="${escape(description)}" />`,
    `<link rel="canonical" href="${escape(canonical)}" />`,
    `<meta property="og:title" content="${escape(title)}" />`,
    `<meta property="og:description" content="${escape(description)}" />`,
    `<meta property="og:url" content="${escape(canonical)}" />`,
    '<meta property="og:type" content="website" />',
    '<meta property="og:site_name" content="Project Graphite" />',
    '<meta name="twitter:card" content="summary" />',
  ].join('\n    ');

const template = await readFile(join(DIST, 'index.html'), 'utf8');
const open = template.indexOf(OPEN);
const close = template.indexOf(CLOSE);

if (open === -1 || close === -1) {
  throw new Error(`index.html is missing the ${OPEN} … ${CLOSE} markers`);
}

const { render, routePaths } = await import(
  pathToFileURL(join(process.cwd(), 'dist-ssr', 'entry-server.js')).href
);

const locations = [];

for (const route of routePaths) {
  const { html, meta } = render(route);
  locations.push(meta.canonical);
  const page = template
    .slice(0, open)
    .concat(head(meta), template.slice(close + CLOSE.length))
    .replace('<div id="root"></div>', () => `<div id="root">${html}</div>`);

  const file = route === '/' ? join(DIST, 'index.html') : join(DIST, route, 'index.html');
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, page, 'utf8');
  console.log(`prerendered ${route} -> ${file}`);
}

const sitemap = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...locations.map((location) => `  <url><loc>${location}</loc></url>`),
  '</urlset>',
  '',
].join('\n');

await writeFile(join(DIST, 'sitemap.xml'), sitemap, 'utf8');
console.log('generated sitemap.xml');

const ORIGIN = 'https://project-graphite.com';
const { members, projects } = JSON.parse(
  await readFile(join('src', 'data', 'registry.json'), 'utf8'),
);
const statusLabel = {
  live: 'live',
  wip: 'in progress',
  archived: 'archived',
  'source-only': 'source only',
};
const projectLine = (project) =>
  [
    `- [${project.name}](${ORIGIN}${project.path}/): ${project.summary}`,
    project.url && project.status === 'live'
      ? ` Open it at ${project.url}.`
      : ` Status: ${statusLabel[project.status]}.`,
    ` Source: ${project.repoUrl}`,
  ].join('');

const llms = [
  '# Project Graphite',
  '',
  '> A shared portfolio for Project Graphite members, their work and the applications they deploy.',
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
    (member) => `- [${member.name}](${ORIGIN}/members/${member.handle}/): ${member.headline}`,
  ),
  '',
  '## Site',
  '',
  `- [Changelog](${ORIGIN}/changelog/): every release of every project`,
  `- [Sitemap](${ORIGIN}/sitemap.xml): every page on the site`,
  '',
].join('\n');

await writeFile(join(DIST, 'llms.txt'), llms, 'utf8');
console.log('generated llms.txt');
