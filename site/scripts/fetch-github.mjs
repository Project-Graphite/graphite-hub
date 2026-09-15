import { readFile, writeFile } from 'node:fs/promises';

const OUTPUT = 'src/data/github.json';

const registry = JSON.parse(await readFile('src/data/registry.json', 'utf8'));

const headers = {
  Accept: 'application/vnd.github+json',
  'User-Agent': 'project-graphite-portfolio',
};

if (process.env.GITHUB_TOKEN) {
  headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
}

const profiles = {};

for (const person of registry.people) {
  const response = await fetch(`https://api.github.com/users/${person.github}`, { headers });

  if (!response.ok) {
    throw new Error(`GitHub answered ${response.status} for ${person.github}`);
  }

  const user = await response.json();

  profiles[person.github] = {
    avatarUrl: user.avatar_url,
    publicRepos: user.public_repos,
    followers: user.followers,
    joined: user.created_at.slice(0, 4),
  };
}

await writeFile(OUTPUT, JSON.stringify(profiles, null, 2) + '\n', 'utf8');
console.log(`Fetched ${Object.keys(profiles).length} GitHub profiles to ${OUTPUT}.`);
