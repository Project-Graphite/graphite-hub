import { readFile, writeFile } from 'node:fs/promises';

const OUTPUT = 'src/data/github.json';

const registry = JSON.parse(await readFile('src/data/registry.json', 'utf8'));
const cached = JSON.parse(await readFile(OUTPUT, 'utf8').catch(() => '{}'));

const headers = {
  Accept: 'application/vnd.github+json',
  'User-Agent': 'project-graphite-hub',
};

if (process.env.GITHUB_TOKEN) {
  headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
}

const entries = await Promise.all(
  registry.people.map(async (person) => {
    try {
      const response = await fetch(`https://api.github.com/users/${person.github}`, {
        headers,
        signal: AbortSignal.timeout(10_000),
      });

      if (!response.ok) {
        throw new Error(`GitHub answered ${response.status}`);
      }

      const user = await response.json();
      return [
        person.github,
        {
          avatarUrl: user.avatar_url,
          publicRepos: user.public_repos,
          followers: user.followers,
          joined: user.created_at.slice(0, 4),
        },
      ];
    } catch (error) {
      console.warn(`Could not refresh ${person.github}: ${error.message}. Using cached data.`);
      return [
        person.github,
        cached[person.github] ?? {
          avatarUrl: `https://github.com/${encodeURIComponent(person.github)}.png?size=128`,
          publicRepos: null,
          followers: null,
          joined: null,
        },
      ];
    }
  }),
);

await writeFile(OUTPUT, JSON.stringify(Object.fromEntries(entries), null, 2) + '\n', 'utf8');
console.log(`Prepared ${entries.length} GitHub profiles in ${OUTPUT}.`);
