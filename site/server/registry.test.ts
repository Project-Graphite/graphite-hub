import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { applyEntries, storedEntries, validateEntries, type RegistryEntry } from './registry.ts';
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
  it('reports added, changed and removed slugs and stores only the incoming set', () => {
    const db = memoryDatabase();
    applyEntries(db, [entry('strata'), entry('tracker')], '2026-11-05T00:00:00.000Z');

    const diff = applyEntries(
      db,
      [entry('strata', 'Strata renamed'), entry('pixelpocket')],
      '2026-11-05T01:00:00.000Z',
    );

    assert.deepEqual(diff, { added: ['pixelpocket'], removed: ['tracker'], changed: ['strata'] });
    assert.deepEqual(
      storedEntries(db).map((stored) => [stored.slug, stored.name]),
      [
        ['pixelpocket', 'A project'],
        ['strata', 'Strata renamed'],
      ],
    );
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
