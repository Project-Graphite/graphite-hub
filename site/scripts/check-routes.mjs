import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const registry = JSON.parse(await readFile('src/data/registry.json', 'utf8'));
const routes = [
  '/',
  '/members',
  '/epics',
  '/projects',
  ...registry.members.map((member) => member.path),
  ...registry.projects.map((project) => project.path),
  '/changelog',
  ...registry.members.map((member) => `/changelog${member.path}`),
  ...registry.projects.map((project) => `/changelog${project.path}`),
];

const missing = [];

for (const route of routes) {
  const file = route === '/' ? join('dist', 'index.html') : join('dist', route, 'index.html');
  try {
    await access(file);
  } catch {
    missing.push(`${route} (expected ${file})`);
  }
}

for (const asset of ['404.html', 'robots.txt', '_headers', '_redirects']) {
  try {
    await access(join('dist', asset));
  } catch {
    missing.push(`${asset} (expected dist/${asset})`);
  }
}

const sitemap = await readFile(join('dist', 'sitemap.xml'), 'utf8');

for (const route of routes) {
  const location = `https://project-graphite.com${route === '/' ? route : `${route}/`}`;
  if (!sitemap.includes(`<loc>${location}</loc>`)) {
    missing.push(`sitemap entry for ${route}`);
  }
}

if (missing.length > 0) {
  for (const entry of missing) {
    console.error(`::error::Nothing rendered for ${entry}`);
  }
  process.exit(1);
}

console.log(`All ${routes.length} registry routes and discovery files are present.`);
