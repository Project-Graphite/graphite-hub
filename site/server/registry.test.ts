import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { archiveUndeployed, readProjects } from './projects.ts';
import { applyEntries, validateEntries, type RegistryEntry } from './registry.ts';
import { memoryDatabase } from './testing.ts';

const schema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  required: ['slug', 'name'],
  properties: {
    slug: { type: 'string', pattern: '^[a-z0-9-]+$' },
    name: { type: 'string', minLength: 2 },
  },
};

const entry = (slug: string, name = 'A project'): RegistryEntry => ({
  slug,
  kind: 'project',
  name,
  summary: 'A project summary long enough to pass.',
  repo: `project-graphite/${slug}`,
  owner: 'amrmscll',
  authors: ['AmrMsCLL'],
  status: 'live',
  deploy: { kind: 'none' },
});

describe('validateEntries', () => {
  it('accepts an entry the schema accepts', () => {
    const { entries, problems } = validateEntries(schema, [
      { name: 'strata.yml', text: 'slug: strata\nname: Strata\n' },
    ]);
    assert.deepEqual(problems, []);
    assert.equal(entries[0].slug, 'strata');
  });

  it('skips an entry the schema refuses and names the file', () => {
    const { entries, problems } = validateEntries(schema, [
      { name: 'bad.yml', text: 'slug: Bad Slug\nname: B\n' },
    ]);
    assert.equal(entries.length, 0);
    assert.match(problems[0], /^projects\/bad\.yml: /);
  });

  it('skips an entry whose slug is not its file name', () => {
    const { entries, problems } = validateEntries(schema, [
      { name: 'other.yml', text: 'slug: strata\nname: Strata\n' },
    ]);
    assert.equal(entries.length, 0);
    assert.match(problems[0], /does not match the file name/);
  });
});

describe('applyEntries', () => {
  const stored = (db: ReturnType<typeof memoryDatabase>) =>
    db
      .prepare('SELECT slug, name, removed_at IS NOT NULL AS removed FROM projects ORDER BY slug')
      .all()
      .map((row) => [row.slug, row.name, row.removed]);

  it('seeds content on first sight, then reports added, changed and removed slugs and keeps what was removed', () => {
    const db = memoryDatabase();
    applyEntries(db, [entry('strata'), entry('tracker')], '2026-11-05T00:00:00.000Z');

    const diff = applyEntries(
      db,
      [
        { ...entry('strata', 'Strata renamed'), repo: 'project-graphite/strata-app' },
        entry('pixelpocket'),
      ],
      '2026-11-05T01:00:00.000Z',
    );

    assert.deepEqual(diff, { added: ['pixelpocket'], removed: ['tracker'], changed: ['strata'] });
    assert.deepEqual(stored(db), [
      ['pixelpocket', 'A project', 0],
      ['strata', 'A project', 0],
      ['tracker', 'A project', 1],
    ]);
    assert.deepEqual(
      readProjects(db).map((project) => [project.slug, project.repo]),
      [
        ['pixelpocket', 'project-graphite/pixelpocket'],
        ['strata', 'project-graphite/strata-app'],
      ],
    );
  });

  it('counts a change of content in the registry as no change', () => {
    const db = memoryDatabase();
    applyEntries(db, [entry('strata')], '2026-11-05T00:00:00.000Z');
    assert.deepEqual(
      applyEntries(db, [entry('strata', 'Strata renamed')], '2026-11-05T01:00:00.000Z'),
      { added: [], removed: [], changed: [] },
    );
  });

  it('removes nothing when the listing had a problem', () => {
    const db = memoryDatabase();
    applyEntries(db, [entry('strata'), entry('tracker')], '2026-11-05T00:00:00.000Z');
    assert.deepEqual(applyEntries(db, [entry('strata')], '2026-11-05T01:00:00.000Z', false), {
      added: [],
      removed: [],
      changed: [],
    });
    assert.deepEqual(stored(db), [
      ['strata', 'A project', 0],
      ['tracker', 'A project', 0],
    ]);
  });

  it('brings a returning slug back with the content it had', () => {
    const db = memoryDatabase();
    applyEntries(db, [entry('strata'), entry('tracker')], '2026-11-05T00:00:00.000Z');
    db.prepare("UPDATE projects SET name = 'Edited on the site' WHERE slug = 'tracker'").run();
    applyEntries(db, [entry('strata')], '2026-11-05T01:00:00.000Z');
    assert.deepEqual(
      readProjects(db).map((project) => project.slug),
      ['strata'],
    );
    assert.deepEqual(
      applyEntries(db, [entry('strata'), entry('tracker')], '2026-11-05T02:00:00.000Z'),
      { added: ['tracker'], removed: [], changed: [] },
    );
    assert.deepEqual(stored(db), [
      ['strata', 'A project', 0],
      ['tracker', 'Edited on the site', 0],
    ]);
  });

  it('trims the seeded summary and archives a live project the registry no longer deploys', () => {
    const db = memoryDatabase();
    applyEntries(
      db,
      [
        {
          ...entry('strata'),
          summary: 'A summary that ends in a newline.\n',
          deploy: { kind: 'compose', host: 'strata.project-graphite.com' },
        },
      ],
      '2026-11-05T00:00:00.000Z',
    );
    assert.equal(readProjects(db)[0].summary, 'A summary that ends in a newline.');
    assert.deepEqual(archiveUndeployed(db), []);
    applyEntries(db, [entry('strata')], '2026-11-05T01:00:00.000Z');
    assert.deepEqual(archiveUndeployed(db), [{ slug: 'strata', name: 'A project', listed: true }]);
    assert.equal(readProjects(db)[0].status, 'archived');
    assert.deepEqual(archiveUndeployed(db), []);
  });

  it('reports nothing when the registry did not change', () => {
    const db = memoryDatabase();
    applyEntries(db, [entry('strata')], '2026-11-05T00:00:00.000Z');
    assert.deepEqual(applyEntries(db, [entry('strata')], '2026-11-05T01:00:00.000Z'), {
      added: [],
      removed: [],
      changed: [],
    });
  });
});
