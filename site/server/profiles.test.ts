import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Refused, type Block } from '../app/profile.ts';
import { createProfiles } from './profiles.ts';
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
});
