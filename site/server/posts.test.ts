import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Refused } from '../app/profile.ts';
import { createJobs } from './jobs.ts';
import { accessTo, createPosts, readPublished } from './posts.ts';
import { jsonToState, render } from './render.ts';
import { memoryDatabase, recordingBus } from './testing.ts';

function setup() {
  const db = memoryDatabase();
  const { bus, recorded, published, link } = recordingBus();
  for (const [handle, login] of [
    ['amrmscll', 'AmrMsCLL'],
    ['omar', 'Omar-Mohamed24'],
  ]) {
    db.prepare(
      "INSERT INTO members (handle, login, name, avatar_url, role, joined_at, synced_at) VALUES (?, ?, ?, '', 'member', '2026-01-01', '2026-01-01')",
    ).run(handle, login, handle);
  }
  db.prepare(
    "INSERT INTO projects (slug, repo, entry, synced_at) VALUES ('strata', 'project-graphite/strata', '{}', '2026-01-01')",
  ).run();
  db.prepare(
    "INSERT INTO uploads (id, owner, kind, mime, bytes, width, height, at) VALUES ('img1', 'amrmscll', 'cover', 'image/webp', 1, 1, 1, '2026-01-01')",
  ).run();
  const jobs = createJobs(db, {}, () => {});
  const announced: string[] = [];
  const posts = createPosts(db, bus, jobs, (post) => announced.push(post.id));
  return { db, jobs, posts, recorded, published, link, announced };
}

const fields = {
  title: 'Hello, world',
  slug: '',
  summary: 'A first post.',
  tags: ['hub'],
  project: 'strata',
  coverUpload: 'img1',
  editors: ['omar'],
};

describe('posts', () => {
  it('creates a draft from a template and derives the slug from the title', async () => {
    const { posts } = setup();
    const id = await posts.create('amrmscll', 'amrmscll', 'release-notes');
    assert.equal(posts.read(id)?.status, 'draft');
    assert.match(posts.preview(id).html, /<h2 id="highlights">/);
    const saved = await posts.save(id, fields, 'amrmscll');
    assert.equal(saved.slug, 'hello-world');
    const second = await posts.create('amrmscll', 'amrmscll', null);
    assert.equal((await posts.save(second, fields, 'amrmscll')).slug, 'hello-world-2');
  });

  it('refuses bad settings', async () => {
    const { posts } = setup();
    const id = await posts.create('amrmscll', 'amrmscll', null);
    await assert.rejects(posts.save(id, { ...fields, project: 'nope' }, 'amrmscll'), Refused);
    await assert.rejects(posts.save(id, { ...fields, editors: ['ghost'] }, 'amrmscll'), Refused);
    await assert.rejects(posts.save(id, { ...fields, tags: ['Bad Tag'] }, 'amrmscll'), Refused);
    await assert.rejects(posts.publish(id, 'amrmscll'), Refused);
  });

  it('publishes once: html, reading time, a version and a public activity row', async () => {
    const { db, posts, recorded } = setup();
    const id = await posts.create('amrmscll', 'amrmscll', null);
    await posts.save(id, fields, 'amrmscll');
    const words = Array.from({ length: 500 }, (_, index) => `word${index}`).join(' ');
    posts.storeDoc(
      id,
      jsonToState({
        type: 'doc',
        content: [
          { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Why' }] },
          { type: 'paragraph', content: [{ type: 'text', text: words }] },
          { type: 'image', attrs: { src: 'https://elsewhere.example/x.png' } },
          { type: 'image', attrs: { src: '/uploads/img1/1600.webp' } },
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'x',
                marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }],
              },
            ],
          },
        ],
      }),
      'amrmscll',
    );
    const post = await posts.publish(id, 'amrmscll');
    assert.equal(post.status, 'published');
    assert.equal(post.readingMinutes, 3);
    const html = posts.html(id)!;
    assert.match(html, /<h2 id="why">Why<\/h2>/);
    assert.match(html, /src="\/uploads\/img1\/1600\.webp"/);
    assert.doesNotMatch(html, /elsewhere\.example|javascript:/);
    assert.equal(posts.versions(id)[0].label, 'published');
    assert.equal(recorded[0].kind, 'post');
    assert.equal(recorded[0].public, true);
    assert.deepEqual(
      readPublished(db, () => '/amr').map((summary) => summary.path),
      ['/amr/blog/hello-world'],
    );
  });

  it('leaves a scheduled post untouched while the bus is down, so the job publishes it later', async () => {
    const { db, posts, link, announced, recorded } = setup();
    const id = await posts.create('amrmscll', 'amrmscll', null);
    await posts.save(id, fields, 'amrmscll');
    await posts.schedule(id, new Date(Date.now() + 60_000).toISOString(), 'amrmscll');
    link.down = true;
    await assert.rejects(posts.publish(id, 'amrmscll'), Refused);
    const errors: unknown[] = [];
    const fresh = createJobs(db, { publish: (ref) => posts.publishDue(ref) }, (error) =>
      errors.push(error),
    );
    const due = Date.now() + 61_000;
    assert.deepEqual(await fresh.runDue(due), []);
    assert.equal(posts.read(id)?.status, 'scheduled');
    assert.equal(errors.length, 1);
    assert.equal(fresh.pending('publish', id), true);
    link.down = false;
    assert.deepEqual(await fresh.runDue(due + 60_000), [`publish:${id}`]);
    assert.equal(posts.read(id)?.status, 'published');
    assert.deepEqual(announced, [id]);
    assert.equal(recorded.filter((event) => event.kind === 'post').length, 1);
    fresh.stop();
  });

  it('schedules through the jobs table and publishes when due', async () => {
    const { db, posts, jobs } = setup();
    const id = await posts.create('amrmscll', 'amrmscll', null);
    await posts.save(id, fields, 'amrmscll');
    await assert.rejects(posts.schedule(id, '2000-01-01T00:00:00.000Z', 'amrmscll'), Refused);
    const due = new Date(Date.now() + 60_000).toISOString();
    await posts.schedule(id, due, 'amrmscll');
    assert.equal(posts.read(id)?.status, 'scheduled');
    assert.equal(jobs.pending('publish', id), true);
    const fresh = createJobs(db, { publish: (ref) => posts.publishDue(ref) }, () => {});
    assert.deepEqual(await fresh.runDue(Date.now()), []);
    assert.deepEqual(await fresh.runDue(Date.now() + 61_000), [`publish:${id}`]);
    assert.equal(posts.read(id)?.status, 'published');
    assert.equal(fresh.pending('publish', id), false);
    jobs.stop();
    fresh.stop();
  });

  it('trashes, restores to the previous status and removes', async () => {
    const { posts } = setup();
    const id = await posts.create('amrmscll', 'amrmscll', null);
    await posts.save(id, fields, 'amrmscll');
    await posts.publish(id, 'amrmscll');
    await posts.trash(id, 'amrmscll');
    assert.equal(posts.read(id)?.status, 'trashed');
    await posts.restore(id, 'amrmscll');
    assert.equal(posts.read(id)?.status, 'published');
    await posts.unpublish(id, 'amrmscll');
    assert.equal(posts.read(id)?.status, 'draft');
    await posts.remove(id, 'amrmscll');
    assert.equal(posts.read(id), undefined);
  });

  it('keeps versions and reads them back as documents', async () => {
    const { posts } = setup();
    const id = await posts.create('amrmscll', 'amrmscll', 'tutorial');
    await posts.keep(id, 'amrmscll', 'first');
    const [version] = posts.versions(id);
    assert.equal(version.label, 'first');
    const content = posts.versionContent(id, version.id);
    assert.match(render(jsonToState(content)).html, /Before you start/);
    assert.equal(posts.snapshot(id, 'amrmscll', jsonToState(content)), undefined);
    assert.equal(posts.versions(id).length, 1);
  });

  it('saves a template from a post and lists it beside the built-in ones', async () => {
    const { posts } = setup();
    const id = await posts.create('amrmscll', 'amrmscll', 'announcement');
    const template = await posts.saveTemplate(id, 'launch', 'amrmscll');
    assert.ok(posts.templates('amrmscll').some((entry) => entry.id === template));
    const next = await posts.create('amrmscll', 'amrmscll', template);
    assert.match(posts.preview(next).html, /Why we built it/);
  });

  it('decides who may edit and who may manage', async () => {
    const post = { author: 'amrmscll', editors: ['omar'] };
    assert.deepEqual(accessTo(post, { handle: 'amrmscll', owner: false }), {
      edit: true,
      manage: true,
    });
    assert.deepEqual(accessTo(post, { handle: 'omar', owner: false }), {
      edit: true,
      manage: false,
    });
    assert.deepEqual(accessTo(post, { handle: 'nier', owner: false }), {
      edit: false,
      manage: false,
    });
    assert.deepEqual(accessTo(post, { handle: null, owner: true }), { edit: true, manage: true });
  });

  it('lists a member’s own and co-edited posts, and everything for the owner', async () => {
    const { posts } = setup();
    const mine = await posts.create('amrmscll', 'amrmscll', null);
    await posts.save(mine, fields, 'amrmscll');
    const theirs = await posts.create('omar', 'omar', null);
    assert.deepEqual(
      posts.byAuthor('omar').map((post) => post.id),
      [theirs, mine],
    );
    assert.equal(posts.byAuthor('nier').length, 0);
    assert.equal(posts.byAuthor(null).length, 2);
  });
});
