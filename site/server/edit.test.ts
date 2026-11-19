import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import type { EditTarget } from '../app/editing/contract.ts';
import type { Viewer } from '../app/types.ts';
import { createEdit } from './edit.ts';
import { createProfiles } from './profiles.ts';
import { createProjects } from './projects.ts';
import { applyEntries, type RegistryEntry } from './registry.ts';
import { createSettings } from './settings.ts';
import { memoryDatabase, recordingBus } from './testing.ts';
import type { Uploads } from './uploads.ts';

const OWNER: Viewer = { login: 'AmrMsCLL', avatarUrl: '', owner: true };
const OMAR: Viewer = { login: 'Omar-Mohamed24', avatarUrl: '', owner: false };
const NIER: Viewer = { login: 'Nier0o', avatarUrl: '', owner: false };

const STRATA: EditTarget = { kind: 'project', slug: 'strata' };
const POCKET: EditTarget = { kind: 'project', slug: 'pixelpocket' };
const SUMMARY = 'A summary that is long enough to be accepted.';

const entry = (slug: string, owner: string, login: string): RegistryEntry => ({
  slug,
  kind: 'project',
  name: slug,
  summary: 'A project summary long enough to pass.',
  repo: `project-graphite/${slug}`,
  owner,
  authors: [login],
  status: 'live',
  deploy: { kind: 'compose', host: `${slug}.project-graphite.com` },
});

function setup() {
  const db = memoryDatabase();
  db.prepare(
    `INSERT INTO members (handle, login, name, avatar_url, role, joined_at, synced_at) VALUES
       ('amrmscll', 'AmrMsCLL', 'Amr', '', 'owner', 'now', 'now'),
       ('omar-mohamed24', 'Omar-Mohamed24', 'Omar', '', 'member', 'now', 'now'),
       ('nier0o', 'Nier0o', 'Nier', '', 'member', 'now', 'now')`,
  ).run();
  applyEntries(
    db,
    [
      entry('strata', 'amrmscll', 'AmrMsCLL'),
      entry('pixelpocket', 'omar-mohamed24', 'Omar-Mohamed24'),
    ],
    '2026-11-18T00:00:00.000Z',
  );
  const { bus, published, recorded } = recordingBus();
  const stored: [string, string][] = [];
  const projects = createProjects(db, bus);
  const profiles = createProfiles(db, bus);
  const edit = createEdit(db, {
    settings: createSettings(db, bus),
    profiles,
    projects,
    uploads: {
      store: async (owner, kind) => {
        const id = String(stored.push([owner, kind])).padStart(24, '0');
        db.prepare(
          "INSERT INTO uploads (id, owner, kind, mime, bytes, width, height, at) VALUES (?, ?, ?, 'image/webp', 1, 1, 1, 'now')",
        ).run(id, owner, kind);
        return id;
      },
    } satisfies Uploads,
  });
  return { db, edit, projects, profiles, published, recorded, stored };
}

const refusal = (result: unknown) => (result as { ok: false; error: string }).error;

describe('edit: who may', () => {
  it('answers a guest with nothing, whatever they send', async () => {
    const { edit } = setup();
    assert.equal(await edit.apply({ target: STRATA, fields: { name: 'Mine now' } }, null), null);
    assert.equal(await edit.apply('nonsense', null), null);
    assert.equal(await edit.restore(1, null), null);
    assert.equal(edit.history([STRATA], null), null);
    assert.equal(edit.history([], null), null);
    assert.equal(await edit.upload(STRATA, 'cover', new Blob(['x']), null), null);
  });

  it('lets only the organisation owner change a setting', async () => {
    const { edit } = setup();
    const patch = { target: { kind: 'setting', key: 'site.name' }, value: 'Graphite' };
    assert.equal(await edit.apply(patch, OMAR), null);
    assert.deepEqual(await edit.apply(patch, OWNER), { ok: true, version: 2 });
    assert.equal(
      await edit.apply({ target: { kind: 'setting', key: 'site.nope' }, value: 'x' }, OWNER),
      null,
    );
  });

  it('lets a member change their own profile and nobody else’s; the owner may change anyone’s', async () => {
    const { edit, profiles } = setup();
    const omar = { kind: 'profile', handle: 'omar-mohamed24' };
    const saved = await edit.apply({ target: omar, fields: { headline: 'Mine' } }, OMAR);
    assert.equal(saved?.ok, true);
    assert.equal(await edit.apply({ target: omar, fields: { headline: 'Taken' } }, NIER), null);
    assert.equal(profiles.read('omar-mohamed24').headline, 'Mine');
    assert.equal(
      (await edit.apply({ target: omar, fields: { headline: 'By the owner' } }, OWNER))?.ok,
      true,
    );
    assert.equal(
      await edit.apply(
        { target: { kind: 'profile', handle: 'nobody' }, fields: { headline: 'x' } },
        OWNER,
      ),
      null,
    );
  });

  it('lets a project’s owner change it, and refuses another member', async () => {
    const { edit, projects } = setup();
    assert.equal(
      (await edit.apply({ target: POCKET, fields: { name: '  PixelPocket  ' } }, OMAR))?.ok,
      true,
    );
    assert.equal(projects.read('pixelpocket')!.name, 'PixelPocket');
    assert.equal(await edit.apply({ target: POCKET, fields: { name: 'Taken over' } }, NIER), null);
    assert.equal(await edit.apply({ target: STRATA, fields: { name: 'Taken over' } }, OMAR), null);
    assert.equal(projects.read('strata')!.name, 'strata');
    assert.equal(
      await edit.apply(
        { target: { kind: 'project', slug: 'missing' }, fields: { name: 'Nothing' } },
        OWNER,
      ),
      null,
    );
  });

  it('keeps owner, authors and the featured order for the organisation owner', async () => {
    const { edit, projects } = setup();
    for (const fields of [
      { owner: 'nier0o' },
      { authors: ['Omar-Mohamed24', 'Nier0o'] },
      { pinOrder: 0 },
      { name: 'Renamed', pinOrder: 0 },
    ]) {
      assert.equal(await edit.apply({ target: POCKET, fields }, OMAR), null);
    }
    assert.equal(projects.read('pixelpocket')!.name, 'pixelpocket');
    assert.equal(
      (
        await edit.apply(
          {
            target: POCKET,
            fields: { owner: 'nier0o', authors: ['Omar-Mohamed24', 'Nier0o'], pinOrder: 1 },
          },
          OWNER,
        )
      )?.ok,
      true,
    );
    const saved = projects.read('pixelpocket')!;
    assert.equal(saved.owner, 'nier0o');
    assert.deepEqual(saved.authors, ['Omar-Mohamed24', 'Nier0o']);
    assert.equal(saved.pinOrder, 1);
    assert.equal(await edit.apply({ target: POCKET, fields: { name: 'Mine again' } }, OMAR), null);
    assert.equal(
      (await edit.apply({ target: POCKET, fields: { name: 'Nier’s' } }, NIER))?.ok,
      true,
    );
  });
});

describe('edit: what is refused', () => {
  it('refuses unknown keys on every kind of target', async () => {
    const { edit, projects } = setup();
    assert.match(
      refusal(await edit.apply({ target: STRATA, fields: { name: 'Fine', repo: 'x/y' } }, OWNER)),
      /repo cannot be edited/,
    );
    assert.match(
      refusal(await edit.apply({ target: STRATA, fields: { slug: 'other' } }, OWNER)),
      /slug cannot be edited/,
    );
    assert.match(
      refusal(await edit.apply({ target: STRATA, fields: { name: 'Fine' }, extra: 1 }, OWNER)),
      /extra cannot be edited/,
    );
    assert.match(
      refusal(
        await edit.apply(
          { target: { kind: 'profile', handle: 'amrmscll' }, fields: { handle: 'nier0o' } },
          OWNER,
        ),
      ),
      /handle cannot be edited/,
    );
    assert.match(
      refusal(
        await edit.apply(
          { target: { kind: 'setting', key: 'site.name' }, value: 'x', by: 'someone' },
          OWNER,
        ),
      ),
      /by cannot be edited/,
    );
    assert.equal(projects.read('strata')!.name, 'strata');
  });

  it('gives the reason for a value that does not fit', async () => {
    const { edit, projects } = setup();
    const refused = async (fields: object) =>
      refusal(await edit.apply({ target: STRATA, fields }, OWNER));
    assert.equal(await refused({ name: 'x' }), 'A name is 2 to 60 characters.');
    assert.equal(await refused({ summary: 12345 }), 'A summary is 20 to 240 characters.');
    assert.equal(
      await refused({ summary: `   ${'x'.repeat(10)}   ` }),
      'A summary is 20 to 240 characters.',
    );
    assert.equal(await refused({ tags: 'react' }), 'Up to 6 different lowercase tags.');
    assert.equal(await refused({ tags: ['React'] }), 'Up to 6 different lowercase tags.');
    assert.match(await refused({ status: 'paused' }), /A status is one of/);
    assert.equal(await refused({ listed: 'yes' }), 'Listed is on or off.');
    assert.equal(await refused({ accent: 'blue' }), 'An accent is a colour like #6f8fd1.');
    assert.equal(await refused({ layout: 'grid' }), 'The layout is a window or a card.');
    assert.match(await refused({ feature: { note: 'x'.repeat(601) } }), /The feature slot/);
    assert.match(await refused({ showcase: { problem: 'short' } }), /A showcase has/);
    assert.match(await refused({ authors: [] }), /Authors are GitHub logins/);
    assert.match(await refused({}), /not valid/);
    assert.equal(await refused({ owner: 'ghost' }), 'ghost is not a member.');
    assert.equal(await refused({ coverUpload: 'f'.repeat(24) }), 'That image is not an upload.');
    assert.match(
      refusal(
        await edit.apply({ target: { kind: 'setting', key: 'site.name' }, value: '' }, OWNER),
      ),
      /must be 1 to/,
    );
    assert.match(
      refusal(
        await edit.apply(
          { target: { kind: 'profile', handle: 'amrmscll' }, fields: { alias: 'strata' } },
          OWNER,
        ),
      ),
      /projects come first/,
    );
    assert.deepEqual(projects.read('strata')!.tags, []);
  });
});

describe('edit: what it changes', () => {
  it('changes every project field on the site without a request to GitHub, and survives a registry sync', async () => {
    const { db, edit, projects, published } = setup();
    const fetched = mock.method(globalThis, 'fetch', async () => {
      throw new Error('An edit reached for the network.');
    });
    const cover = (await edit.upload(STRATA, 'cover', new Blob(['x']), OWNER)) as {
      upload: string;
    };
    const fields = {
      name: 'Strata',
      summary: SUMMARY,
      tags: ['react', 'nestjs'],
      status: 'wip' as const,
      listed: false,
      pinOrder: 2,
      showcase: {
        problem: 'p'.repeat(20),
        approach: 'a'.repeat(20),
        outcome: 'o'.repeat(20),
        contributions: [{ github: 'AmrMsCLL', summary: 's'.repeat(20) }],
      },
      coverUpload: cover.upload,
      accent: '#6f8fd1',
      layout: 'card' as const,
      feature: { note: 'A note', screenshot: null, posts: [] },
    };
    assert.equal((await edit.apply({ target: STRATA, fields }, OWNER))?.ok, true);
    applyEntries(
      db,
      [
        { ...entry('strata', 'amrmscll', 'AmrMsCLL'), name: 'From the repository', listed: true },
        entry('pixelpocket', 'omar-mohamed24', 'Omar-Mohamed24'),
      ],
      '2026-11-18T01:00:00.000Z',
    );
    const saved = projects.read('strata')!;
    for (const [key, value] of Object.entries(fields)) {
      assert.deepEqual(saved[key as keyof typeof fields], value, key);
    }
    assert.equal(fetched.mock.callCount(), 0);
    fetched.mock.restore();
    assert.deepEqual(
      published.map((event) => event.topic),
      ['projects'],
    );
  });

  it('keeps what was there before the first change, lists the versions and restores one', async () => {
    const { edit, projects } = setup();
    const first = await edit.apply({ target: POCKET, fields: { summary: SUMMARY } }, OMAR);
    const second = await edit.apply({ target: POCKET, fields: { name: 'Pixel Pocket' } }, OMAR);
    assert.deepEqual(
      [first, second],
      [
        { ok: true, version: 2 },
        { ok: true, version: 3 },
      ],
    );
    const history = edit.history([POCKET, STRATA], OWNER)!;
    assert.deepEqual(
      history.map((version) => [version.id, version.target, version.by]),
      [
        [3, POCKET, 'Omar-Mohamed24'],
        [2, POCKET, 'Omar-Mohamed24'],
        [1, POCKET, 'hub'],
      ],
    );
    assert.equal(edit.history([POCKET, STRATA], OMAR), null);
    assert.equal(edit.history([POCKET], NIER), null);
    assert.equal(edit.history('nonsense', OWNER), null);
    assert.equal(await edit.restore(1, NIER), null);
    assert.equal(await edit.restore(99, OWNER), null);
    assert.deepEqual(await edit.restore(1, OMAR), { ok: true, version: 4 });
    const restored = projects.read('pixelpocket')!;
    assert.equal(restored.name, 'pixelpocket');
    assert.equal(restored.summary, 'A project summary long enough to pass.');
  });

  it('restores a project for its owner without touching what only the organisation owner sets', async () => {
    const { edit, projects } = setup();
    await edit.apply({ target: POCKET, fields: { name: 'Before' } }, OMAR);
    await edit.apply({ target: POCKET, fields: { pinOrder: 3, name: 'After' } }, OWNER);
    assert.equal((await edit.restore(2, OMAR))?.ok, true);
    const restored = projects.read('pixelpocket')!;
    assert.equal(restored.name, 'Before');
    assert.equal(restored.pinOrder, 3);
  });

  it('restores a setting and a profile through the same door', async () => {
    const { edit, profiles } = setup();
    const name = { kind: 'setting', key: 'site.name' } as const;
    const amr = { kind: 'profile', handle: 'amrmscll' } as const;
    await edit.apply({ target: name, value: 'Graphite' }, OWNER);
    await edit.apply({ target: amr, fields: { headline: 'Changed' } }, OWNER);
    const [profile, , setting] = edit
      .history([name, amr], OWNER)!
      .filter((version) => version.by === 'hub' || version.target.kind === 'setting');
    assert.equal(await edit.restore(setting.id, OMAR), null);
    assert.equal((await edit.restore(setting.id, OWNER))?.ok, true);
    assert.equal((await edit.restore(profile.id, OWNER))?.ok, true);
    assert.equal(profiles.read('amrmscll').headline, 'Full-stack Software Engineer');
  });

  it('stores an image under the kinds its target takes', async () => {
    const { edit, stored } = setup();
    const amr = { kind: 'profile', handle: 'amrmscll' };
    assert.deepEqual(await edit.upload(amr, 'avatar', new Blob(['x']), OWNER), {
      upload: '1'.padStart(24, '0'),
    });
    assert.ok('upload' in (await edit.upload(POCKET, 'screenshot', new Blob(['x']), OMAR))!);
    assert.deepEqual(stored, [
      ['amrmscll', 'avatar'],
      ['omar-mohamed24', 'screenshot'],
    ]);
    assert.match(refusal(await edit.upload(POCKET, 'avatar', new Blob(['x']), OMAR)), /takes no/);
    assert.match(refusal(await edit.upload(amr, 'post', new Blob(['x']), OWNER)), /takes no/);
    assert.equal(await edit.upload(amr, 'avatar', new Blob(['x']), OMAR), null);
    assert.equal(
      await edit.upload({ kind: 'setting', key: 'site.name' }, 'cover', new Blob(['x']), OWNER),
      null,
    );
  });
});
