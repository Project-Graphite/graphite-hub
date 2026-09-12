import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const registry = JSON.parse(await readFile('src/data/registry.json', 'utf8'));
const routes = [
  '/',
  ...registry.people.map((person) => person.path),
  ...registry.projects.map((project) => project.path),
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

try {
  await access(join('dist', '404.html'));
} catch {
  missing.push('the 404 page (expected dist/404.html)');
}

if (missing.length > 0) {
  for (const entry of missing) {
    console.error(`::error::Nothing rendered for ${entry}`);
  }
  process.exit(1);
}

console.log(`All ${routes.length} registry routes rendered, plus 404.html.`);
