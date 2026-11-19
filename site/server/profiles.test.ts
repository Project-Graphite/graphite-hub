import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Refused, type Block, type Profile } from '../app/profile.ts';
import { createBus, type Delivery } from './bus.ts';
import { createProfiles, type ProfileChange } from './profiles.ts';
import type { Redis } from './redis.ts';
import { memoryDatabase, recordingBus } from './testing.ts';

function setup() {
  const db = memoryDatabase();
  const { bus, published } = recordingBus();
  db.prepare(
    "INSERT INTO projects (slug, repo, entry, synced_at) VALUES ('strata', 'project-graphite/strata', '{}', 'now')",
  ).run();
  db.prepare(
    "INSERT INTO uploads (id, owner, kind, mime, bytes, width, height, at) VALUES ('img1', 'amrmscll', 'gallery', 'image/webp', 10, 10, 10, 'now')",
  ).run();
  return { db, profiles: createProfiles(db, bus), published };
}

describe('profiles', () => {
  it('gives a member who never edited the default set, filled from the stored blocks', () => {
    const { db, profiles } = setup();
    db.prepare(
      `UPDATE profiles SET blocks = '[{"type":"links","links":[{"label":"github","url":"https://github.com/AmrMsCLL"}]}]' WHERE handle = 'amrmscll'`,
    ).run();
    const profile = profiles.read('amrmscll');
    assert.equal(profile.edited, false);
    assert.deepEqual(
      profile.blocks.map((block) => block.type),
      ['bio', 'projects', 'stack', 'github', 'timeline', 'links', 'short-links'],
    );
    assert.deepEqual(
      profile.blocks.find((block) => block.type === 'links'),
      {
        id: 'links-0',
        type: 'links',
        links: [{ label: 'github', url: 'https://github.com/AmrMsCLL' }],
      },
    );
    assert.equal(profiles.read('nobody').blocks.length, 7);
  });

  it('round-trips every block type', async () => {
    const { profiles, published } = setup();
    const blocks: Block[] = [
      { id: 'a', type: 'bio' },
      { id: 'b', type: 'projects', slugs: ['strata'], layout: 'rows' },
      { id: 'c', type: 'stack', groups: [{ group: 'languages', items: ['TypeScript'] }] },
      { id: 'd', type: 'github' },
      { id: 'e', type: 'timeline' },
      { id: 'f', type: 'links', links: [{ label: 'email', url: 'mailto:a@b.co' }] },
      { id: 'g', type: 'short-links' },
      { id: 'h', type: 'writing' },
      { id: 'i', type: 'gallery', images: [{ upload: 'img1', caption: 'A board' }] },
      { id: 'j', type: 'text', title: 'Now', body: 'Building the hub.' },
      { id: 'k', type: 'quote', text: 'Ship it.', source: '' },
      { id: 'l', type: 'embed', url: 'https://youtu.be/abc', title: 'A talk' },
    ];
    const saved = await profiles.save('amrmscll', { blocks }, 'AmrMsCLL');
    assert.deepEqual(saved.blocks, blocks);
    assert.equal(saved.edited, true);
    assert.equal(published[0].key, 'amrmscll');
  });

  it('refuses a bad block, a foreign upload and an unknown embed host', async () => {
    const { profiles } = setup();
    const refused = (blocks: unknown) =>
      assert.rejects(profiles.save('amrmscll', { blocks: blocks as Block[] }, 'x'), Refused);
    await refused([
      { id: 'a', type: 'links', links: [{ label: 'x', url: 'javascript:alert(1)' }] },
    ]);
    await refused([
      { id: 'a', type: 'gallery', images: [{ upload: 'someone-else', caption: '' }] },
    ]);
    await refused([{ id: 'a', type: 'embed', url: 'https://evil.example/x', title: 'x' }]);
    await refused([{ id: 'a', type: 'nope' }]);
    await refused([
      { id: 'a', type: 'bio' },
      { id: 'a', type: 'github' },
    ]);
  });

  it('applies the alias precedence rule', async () => {
    const { profiles } = setup();
    const alias = (handle: string, value: string) =>
      profiles.save(handle, { fields: { alias: value } }, handle);
    await assert.rejects(alias('amrmscll', 'strata'), /projects come first/);
    await assert.rejects(alias('amrmscll', 'admin'), /page of the site/);
    await assert.rejects(alias('amrmscll', 'Amr'), /lowercase/);
    await alias('amrmscll', 'amr');
    assert.equal(profiles.handleForAlias('amr'), 'amrmscll');
    await assert.rejects(alias('bluocaroot', 'amr'), /another member/);
  });

  it('undoes the last save and resets to the default set', async () => {
    const { profiles } = setup();
    await profiles.save('amrmscll', { fields: { headline: 'First' } }, 'x');
    await profiles.save('amrmscll', { fields: { headline: 'Second' } }, 'x');
    assert.equal((await profiles.undo('amrmscll', 'x')).headline, 'First');
    assert.equal(profiles.history('amrmscll').length, 3);
    await profiles.save(
      'amrmscll',
      { blocks: [{ id: 'q', type: 'quote', text: 'x', source: '' }] },
      'x',
    );
    const reset = await profiles.reset('amrmscll', 'x');
    assert.equal(reset.edited, false);
    assert.equal(reset.blocks.length, 7);
    assert.equal(reset.headline, 'First');
  });

  it('keeps short links per member and hides unlisted ones from the page', async () => {
    const { profiles } = setup();
    await profiles.setShortLink(
      'amrmscll',
      { name: 'cv', url: 'https://example.com/cv.pdf', listed: true },
      'x',
    );
    await profiles.setShortLink(
      'amrmscll',
      { name: 'draft', url: 'https://example.com/d', listed: false },
      'x',
    );
    assert.equal(profiles.shortLink('amrmscll', 'draft'), 'https://example.com/d');
    assert.deepEqual(
      profiles.shortLinks('amrmscll').map((link) => link.name),
      ['cv'],
    );
    await assert.rejects(
      profiles.setShortLink(
        'amrmscll',
        { name: 'x', url: 'http://plain.example', listed: true },
        'x',
      ),
      Refused,
    );
    await profiles.removeShortLink('amrmscll', 'cv', 'x');
    assert.equal(profiles.shortLink('amrmscll', 'cv'), undefined);
  });

  it('refuses a draft that names another member and leaves that member alone', async () => {
    const { db, profiles, published } = setup();
    const victim = () => db.prepare("SELECT * FROM profiles WHERE handle = 'amrmscll'").get();
    const before = victim();
    await assert.rejects(
      profiles.save(
        'nier0o',
        {
          fields: { handle: 'amrmscll', headline: 'Taken over', bio: null },
          blocks: [{ id: 'q', type: 'quote', text: 'Taken over', source: '' }],
        } as ProfileChange,
        'nier0o',
      ),
      Refused,
    );
    assert.deepEqual(victim(), before);
    assert.deepEqual(profiles.history('amrmscll'), []);
    assert.deepEqual(profiles.history('nier0o'), []);
    assert.deepEqual(published, []);
  });

  it('saves only what a member may change, under the handle it was called with', async () => {
    const { db, profiles } = setup();
    const save = (fields: object) => profiles.save('nier0o', { fields } as ProfileChange, 'nier0o');
    for (const stray of [
      { handle: 'nier0o' },
      { edited: false },
      { blocks: [] },
      { updated_at: '2000-01-01T00:00:00.000Z' },
    ]) {
      await assert.rejects(save({ headline: 'Mine', ...stray }), /not a field of a profile/);
    }
    await assert.rejects(save({ alias: 123 }), Refused);
    await assert.rejects(save({ listed: 'no' }), Refused);
    for (const blocks of [0, '', false]) {
      await assert.rejects(
        profiles.save('nier0o', { blocks } as unknown as ProfileChange, 'nier0o'),
        Refused,
      );
    }
    assert.deepEqual(profiles.history('nier0o'), []);
    const saved = await save({ headline: 'Mine', listed: false });
    assert.equal(saved.handle, 'nier0o');
    assert.equal(saved.headline, 'Mine');
    assert.equal(saved.listed, false);
    assert.deepEqual(
      db
        .prepare("SELECT key FROM versions WHERE kind = 'profile'")
        .all()
        .map((row) => row.key),
      ['nier0o'],
    );
  });

  it('restores a version only for its own member, whatever the stored copy names', async () => {
    const { db, profiles } = setup();
    await profiles.save('amrmscll', { fields: { headline: 'Amr' } }, 'amrmscll');
    await assert.rejects(
      profiles.revert('nier0o', profiles.history('amrmscll')[0].id, 'nier0o'),
      /not one of nier0o/,
    );
    const victim = () => db.prepare("SELECT * FROM profiles WHERE handle = 'amrmscll'").get();
    const before = victim();
    db.prepare(
      "INSERT INTO versions (kind, key, blob, by, at) VALUES ('profile', 'nier0o', ?, 'nier0o', '2026-01-01T00:00:00.000Z')",
    ).run(JSON.stringify({ ...profiles.read('amrmscll'), headline: 'Taken over' }));
    const restored = await profiles.revert('nier0o', profiles.history('nier0o')[0].id, 'nier0o');
    assert.equal(restored.handle, 'nier0o');
    assert.equal(restored.headline, 'Taken over');
    assert.deepEqual(victim(), before);
  });

  it('keeps a display name beside the one GitHub gives, and clears it with null', async () => {
    const { profiles } = setup();
    assert.equal(profiles.read('amrmscll').name, null);
    assert.equal(
      (await profiles.save('amrmscll', { fields: { name: 'Amr El-Sheraey' } }, 'x')).name,
      'Amr El-Sheraey',
    );
    assert.equal(
      (await profiles.save('amrmscll', { fields: { headline: 'H' } }, 'x')).name,
      'Amr El-Sheraey',
    );
    await assert.rejects(profiles.save('amrmscll', { fields: { name: '  ' } }, 'x'), Refused);
    await assert.rejects(
      profiles.save('amrmscll', { fields: { name: 'x'.repeat(61) } }, 'x'),
      Refused,
    );
    assert.equal((await profiles.save('amrmscll', { fields: { name: null } }, 'x')).name, null);
  });

  it('restores a version saved before profiles had a name', async () => {
    const { db, profiles } = setup();
    await profiles.save('amrmscll', { fields: { name: 'Amr', headline: 'Now' } }, 'x');
    const before: Partial<Profile> = { ...profiles.read('amrmscll'), headline: 'Then' };
    delete before.name;
    db.prepare(
      "INSERT INTO versions (kind, key, blob, by, at) VALUES ('profile', 'amrmscll', ?, 'x', '2026-01-01T00:00:00.000Z')",
    ).run(JSON.stringify(before));
    const restored = await profiles.revert('amrmscll', profiles.history('amrmscll')[0].id, 'x');
    assert.equal(restored.headline, 'Then');
    assert.equal(restored.name, null);
  });

  it('stops resolving the alias of a member who left, and resolves it again when they return', async () => {
    const { db, profiles } = setup();
    db.prepare(
      "INSERT INTO members (handle, login, name, avatar_url, role, joined_at, synced_at) VALUES ('amrmscll', 'AmrMsCLL', 'Amr', '', 'owner', 'now', 'now')",
    ).run();
    await profiles.save('amrmscll', { fields: { alias: 'amr' } }, 'x');
    assert.equal(profiles.handleForAlias('amr'), 'amrmscll');
    db.prepare("UPDATE members SET left_at = '2026-11-18T00:00:00.000Z'").run();
    assert.equal(profiles.handleForAlias('amr'), undefined);
    await assert.rejects(
      profiles.save('nier0o', { fields: { alias: 'amr' } }, 'x'),
      /another member/,
    );
    db.prepare('UPDATE members SET left_at = NULL').run();
    assert.equal(profiles.handleForAlias('amr'), 'amrmscll');
  });

  it('tells the console once a day that a listed member updated their page', async () => {
    const db = memoryDatabase();
    db.prepare(
      "INSERT INTO members (handle, login, name, avatar_url, role, joined_at, synced_at) VALUES ('amrmscll', 'AmrMsCLL', 'Amr Mohamed', '', 'owner', 'now', 'now'), ('nier0o', 'Nier0o', 'Nier', '', 'member', 'now', 'now')",
    ).run();
    const bus = createBus(db, { xadd: async () => '1-0' } as unknown as Redis);
    const heard: Delivery[] = [];
    bus.listen((delivery) => heard.push(delivery));
    const profiles = createProfiles(db, bus);
    await profiles.save('amrmscll', { fields: { headline: 'One' } }, 'AmrMsCLL');
    await profiles.save('amrmscll', { fields: { headline: 'Two' } }, 'AmrMsCLL');
    await profiles.save('nier0o', { fields: { listed: false } }, 'Nier0o');
    assert.deepEqual(
      heard.map(({ line, event }) => [line, event.topic, event.kind, event.summary]),
      [
        [1, 'profiles', 'member', 'Amr updated their page'],
        [undefined, 'profiles', 'profile', "amrmscll's page changed"],
        [undefined, 'profiles', 'profile', "nier0o's page changed"],
      ],
    );
    assert.deepEqual(heard[0].event.detail, { member: 'amrmscll', change: 'page' });
  });

  it('keeps one member’s short link apart from another’s of the same name', async () => {
    const { profiles } = setup();
    await profiles.setShortLink(
      'amrmscll',
      { name: 'cv', url: 'https://example.com/amr', listed: true },
      'amrmscll',
    );
    await profiles.setShortLink(
      'nier0o',
      { name: 'cv', url: 'https://example.com/nier', listed: true },
      'nier0o',
    );
    await profiles.removeShortLink('nier0o', 'cv', 'nier0o');
    assert.equal(profiles.shortLink('amrmscll', 'cv'), 'https://example.com/amr');
    assert.equal(profiles.shortLink('nier0o', 'cv'), undefined);
  });
});
