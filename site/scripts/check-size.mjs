import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const BUDGET_KB = 150;
const CLIENT = join('build', 'client');
const ASSETS = join(CLIENT, 'assets');

const manifestFile = (await readdir(ASSETS)).find((file) => /^manifest-.*\.js$/.test(file));
const manifest = JSON.parse(
  (await readFile(join(ASSETS, manifestFile), 'utf8')).replace(
    /^window\.__reactRouterManifest=|;$/g,
    '',
  ),
);

const compressed = new Map();
async function size(asset) {
  if (!compressed.has(asset)) {
    compressed.set(asset, gzipSync(await readFile(join(CLIENT, asset))).length);
  }
  return compressed.get(asset);
}

function chain(route) {
  return route ? [...chain(manifest.routes[route.parentId]), route] : [];
}

const pages = [];
for (const route of Object.values(manifest.routes)) {
  if (!route.hasDefaultExport || route.id === 'root') {
    continue;
  }
  const assets = new Set([
    `/assets/${manifestFile}`,
    manifest.entry.module,
    ...manifest.entry.imports,
    ...chain(route).flatMap((step) => [step.module, ...(step.imports ?? [])]),
  ]);
  const bytes = (await Promise.all([...assets].map((asset) => size(asset)))).reduce(
    (sum, value) => sum + value,
    0,
  );
  pages.push({ id: route.id, kilobytes: bytes / 1024 });
}

pages.sort((a, b) => b.kilobytes - a.kilobytes);
for (const { id, kilobytes } of pages) {
  console.log(`${kilobytes.toFixed(1).padStart(6)} KB  ${id}`);
}
const [largest] = pages;
if (largest.kilobytes > BUDGET_KB) {
  console.error(
    `::error::${largest.id} loads ${largest.kilobytes.toFixed(1)} KB of compressed JavaScript, over the ${BUDGET_KB} KB budget.`,
  );
  process.exit(1);
}
console.log(`Every page is within the ${BUDGET_KB} KB budget.`);
