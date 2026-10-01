import { writeFile } from 'node:fs/promises';
import { loadRegistry, loadReleases } from './releases.mjs';

const OUTPUT = new URL('../src/data/changelog.json', import.meta.url);

const { projects } = await loadRegistry();
const { releases, problems } = await loadReleases(projects);

if (problems.length > 0) {
  for (const problem of problems) {
    console.error(`error: ${problem}`);
  }
  process.exit(1);
}

await writeFile(OUTPUT, JSON.stringify({ releases }, null, 2) + '\n', 'utf8');
console.log(`Compiled ${releases.length} releases to src/data/changelog.json.`);
