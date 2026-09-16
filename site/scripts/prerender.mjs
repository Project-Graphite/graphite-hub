import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const DIST = 'dist';
const ORIGIN = 'https://project-graphite.com';
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

const { legacyRedirects, render, routePaths } = await import(
  pathToFileURL(join(process.cwd(), 'dist-ssr', 'entry-server.js')).href
);

for (const route of routePaths) {
  const { html, meta } = render(route);
  const page = template
    .slice(0, open)
    .concat(head(meta), template.slice(close + CLOSE.length))
    .replace('<div id="root"></div>', `<div id="root">${html}</div>`);

  const file = route === '/' ? join(DIST, 'index.html') : join(DIST, route, 'index.html');
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, page, 'utf8');
  console.log(`prerendered ${route} -> ${file}`);
}

const sitemap = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...routePaths.map(
    (route) => `  <url><loc>${ORIGIN}${route === '/' ? route : `${route}/`}</loc></url>`,
  ),
  '</urlset>',
  '',
].join('\n');

await writeFile(join(DIST, 'sitemap.xml'), sitemap, 'utf8');
await writeFile(
  join(DIST, '_redirects'),
  legacyRedirects.map(({ from, to }) => `${from} ${to}/ 301`).join('\n') + '\n',
  'utf8',
);
console.log(`generated sitemap.xml and ${legacyRedirects.length} legacy redirects`);
