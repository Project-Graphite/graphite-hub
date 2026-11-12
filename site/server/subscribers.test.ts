import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { defaults } from '../app/settings.ts';
import type { Directory } from '../app/types.ts';
import { createJobs } from './jobs.ts';
import type { Outgoing } from './mail.ts';
import { createPosts } from './posts.ts';
import { createSubscribers, DIGEST_JOB, DIGEST_REF } from './subscribers.ts';
import { memoryDatabase, recordingBus } from './testing.ts';

const ORIGIN = 'https://hub.test';

const directory: Directory = {
  members: [
    {
      handle: 'amrmscll',
      alias: 'amr',
      github: 'AmrMsCLL',
      name: 'Amr',
      avatarUrl: '',
      coverUrl: null,
      listed: true,
      headline: null,
      bio: null,
      stack: [],
      links: [],
      publicRepos: null,
      followers: null,
      joined: null,
      accent: '#6f8fd1',
      path: '/amr',
    },
  ],
  projects: [
    {
      slug: 'strata',
      parent: null,
      kind: 'project',
      name: 'Strata',
      summary: '',
      tags: [],
      repo: 'project-graphite/strata',
      repoUrl: 'https://github.com/project-graphite/strata',
      owner: 'amrmscll',
      authors: [],
      status: 'live',
      pinned: false,
      showcase: null,
      url: null,
      path: '/strata',
      coverUrl: null,
      accent: null,
      layout: 'window',
      feature: { note: '', screenshotUrl: null, posts: [] },
      pending: [],
      pullRequest: null,
    },
  ],
  releases: [],
  posts: [],
};

function setup(options: { allowed?: boolean; fail?: boolean } = {}) {
  const db = memoryDatabase();
  db.prepare(
    "INSERT INTO members (handle, login, name, avatar_url, role, joined_at, synced_at) VALUES ('amrmscll', 'AmrMsCLL', 'Amr', '', 'owner', '2026-01-01', '2026-01-01')",
  ).run();
  db.prepare(
    "INSERT INTO projects (slug, repo, entry, synced_at) VALUES ('strata', 'project-graphite/strata', '{}', '2026-01-01')",
  ).run();
  const { bus, published } = recordingBus();
  let clock = Date.parse('2026-11-06T12:00:00.000Z');
  const delivered: Outgoing[] = [];
  const settings = defaults();
  const jobs = createJobs(db, {}, () => {});
  const subscribers = createSubscribers(db, jobs, bus, {
    secret: 'secret',
    origin: ORIGIN,
    allow: async () => options.allowed ?? true,
    settings: () => settings,
    directory: () => directory,
    deliver: async (message) => {
      if (options.fail) {
        throw Object.assign(new Error('550 5.1.1 The email account does not exist'), {
          code: 'EENVELOPE',
          responseCode: 550,
        });
      }
      delivered.push(message);
      return `<${delivered.length}@hub.test>`;
    },
    now: () => clock,
  });
  const posts = createPosts(db, bus, jobs, subscribers.queuePost, () => clock);
  const subscribe = (
    email: string,
    extra: Partial<Parameters<typeof subscribers.subscribe>[0]> = {},
  ) =>
    subscribers.subscribe({
      email,
      scope: 'all',
      cadence: 'each',
      trap: '',
      address: '203.0.113.7',
      ...extra,
    });
  const linkOf = (message: Outgoing, purpose: string) =>
    message.text.match(new RegExp(`${ORIGIN}/subscribe/${purpose}/([^/\\s]+)/([^/\\s]+)`))!;
  const advance = (ms: number) => {
    clock += ms;
  };
  return {
    db,
    jobs,
    bus,
    published,
    settings,
    subscribers,
    posts,
    subscribe,
    delivered,
    linkOf,
    advance,
    now: () => clock,
  };
}

async function publishPost(
  posts: ReturnType<typeof createPosts>,
  title: string,
  project: string | null = null,
) {
  const id = await posts.create('amrmscll', 'amrmscll', null);
  await posts.save(
    id,
    {
      title,
      slug: '',
      summary: `About ${title}.`,
      tags: [],
      project,
      coverUpload: null,
      editors: [],
    },
    'amrmscll',
  );
  return posts.publish(id, 'amrmscll');
}

describe('subscribing', () => {
  it('double opts in: a confirmation email with a signed link, then the post email', async () => {
    const { subscribers, subscribe, delivered, linkOf, posts, now, db } = setup();
    assert.deepEqual(await subscribe('Reader@Example.com'), { ok: true });
    assert.equal(subscribers.count(), 0);
    await subscribers.sends.drain(now());
    assert.equal(delivered.length, 1);
    assert.equal(delivered[0].to, 'reader@example.com');
    assert.match(delivered[0].subject, /Confirm your subscription/);
    assert.match(delivered[0].html, /Confirm &rarr;/);
    assert.equal(delivered[0].unsubscribeUrl, null);

    const [, id, signature] = linkOf(delivered[0], 'confirm');
    assert.equal(subscribers.verify('confirm', id, 'nope'), undefined);
    assert.equal(subscribers.verify('manage', id, signature), undefined);
    await subscribers.confirm(subscribers.verify('confirm', id, signature)!.id);
    assert.equal(subscribers.count(), 1);

    await publishPost(posts, 'Hello, world', 'strata');
    await subscribers.sends.drain(now());
    assert.equal(delivered.length, 2);
    const post = delivered[1];
    assert.equal(post.subject, 'Amr published: Hello, world');
    assert.match(post.html, /href="https:\/\/hub\.test\/amr\/blog\/hello-world"/);
    assert.match(post.html, /About Hello, world\./);
    assert.match(post.text, /https:\/\/hub\.test\/amr\/blog\/hello-world/);
    assert.match(post.unsubscribeUrl!, /\/subscribe\/unsubscribe\//);
    assert.equal(
      db.prepare("SELECT count(*) AS n FROM sends WHERE kind = 'post' AND status = 'sent'").get()!
        .n,
      1,
    );
  });

  it('sends only to scopes that match and never twice for one post', async () => {
    const { subscribers, subscribe, delivered, linkOf, posts, now, db } = setup();
    await subscribe('strata@example.com', { scope: 'project:strata' });
    await subscribe('amr@example.com', { scope: 'member:amrmscll' });
    await subscribe('weekly@example.com', { cadence: 'weekly' });
    await subscribers.sends.drain(now());
    for (const message of delivered.splice(0)) {
      const [, id, signature] = linkOf(message, 'confirm');
      await subscribers.confirm(subscribers.verify('confirm', id, signature)!.id);
    }

    const post = await publishPost(posts, 'No project');
    await subscribers.sends.drain(now());
    assert.deepEqual(
      delivered.map((message) => message.to),
      ['amr@example.com'],
    );
    assert.equal(subscribers.queuePost(post), 0);
    assert.equal(db.prepare("SELECT count(*) AS n FROM sends WHERE kind = 'post'").get()!.n, 1);
  });

  it('refuses bad input, honours the honeypot and the limits', async () => {
    const { subscribers, subscribe, delivered, now, db } = setup();
    assert.equal((await subscribe('not an email')).ok, false);
    assert.equal((await subscribe('a@b.co', { scope: 'project:nope' })).ok, false);
    assert.equal((await subscribe('a@b.co', { cadence: 'hourly' })).ok, false);
    assert.deepEqual(await subscribe('spam@example.com', { trap: 'http://x' }), { ok: true });
    assert.equal(db.prepare('SELECT count(*) AS n FROM subscribers').get()!.n, 0);
    assert.equal((await setup({ allowed: false }).subscribe('a@b.co')).ok, false);

    for (let n = 0; n < 3; n += 1) {
      assert.equal((await subscribe('eager@example.com')).ok, true);
    }
    assert.equal((await subscribe('eager@example.com')).ok, false);
    await subscribers.sends.drain(now());
    assert.equal(delivered.length, 3);
  });

  it('does not let the public form change a confirmed subscription', async () => {
    const { subscribers, subscribe, delivered, linkOf, now } = setup();
    await subscribe('reader@example.com', { scope: 'project:strata' });
    await subscribers.sends.drain(now());
    const [, id, signature] = linkOf(delivered[0], 'confirm');
    await subscribers.confirm(subscribers.verify('confirm', id, signature)!.id);

    await subscribe('reader@example.com', { scope: 'all', cadence: 'weekly' });
    await subscribers.sends.drain(now());
    assert.equal(subscribers.read(id)!.scope, 'project:strata');
    assert.equal(delivered.length, 2);
    assert.match(delivered[1].subject, /Your subscription/);
    assert.match(delivered[1].text, /posts about Strata/);
  });

  it('changes preferences, unsubscribes and comes back from the signed links', async () => {
    const { subscribers, subscribe, delivered, linkOf, posts, now, published } = setup();
    await subscribe('reader@example.com');
    await subscribers.sends.drain(now());
    const [, id, signature] = linkOf(delivered[0], 'confirm');
    await subscribers.confirm(subscribers.verify('confirm', id, signature)!.id);

    assert.equal((await subscribers.update(id, 'member:amrmscll', 'weekly')).ok, true);
    assert.equal((await subscribers.update(id, 'member:ghost', 'weekly')).ok, false);
    assert.equal(subscribers.read(id)!.cadence, 'weekly');

    await subscribers.unsubscribe(id);
    assert.equal(subscribers.count(), 0);
    await publishPost(posts, 'Missed');
    await subscribers.sends.drain(now());
    assert.equal(delivered.length, 1);

    await subscribers.resubscribe(id);
    assert.equal(subscribers.count(), 1);
    assert.deepEqual(
      published.filter((event) => event.topic === 'subscribers').map((event) => event.kind),
      ['asked', 'confirmed', 'changed', 'unsubscribed', 'confirmed'],
    );
  });

  it('suppresses an address after a hard bounce and clears it when it subscribes again', async () => {
    const failing = setup({ fail: true });
    await failing.subscribe('gone@example.com');
    await failing.subscribers.sends.drain(failing.now());
    const subscriber = failing.db.prepare('SELECT * FROM subscribers').get()!;
    assert.match(subscriber.suppressed_reason as string, /does not exist/);
    assert.equal(failing.subscribers.overview().bounces[0].email, 'gone@example.com');
    assert.equal(failing.subscribers.overview().sends.bounced, 1);

    assert.deepEqual(await failing.subscribe('gone@example.com'), { ok: true });
    assert.equal(
      failing.db.prepare('SELECT suppressed_at FROM subscribers').get()!.suppressed_at,
      null,
    );
  });
});

describe('digest', () => {
  it('is skipped with nothing new, then gathers a week of matching posts into one email', async () => {
    const { subscribers, subscribe, delivered, linkOf, posts, now, advance, jobs, db } = setup();
    subscribers.start();
    assert.equal(jobs.pending(DIGEST_JOB, DIGEST_REF), true);
    assert.equal(subscribers.nextDigestAt(), '2026-11-09T08:00:00.000Z');

    await subscribe('weekly@example.com', { cadence: 'weekly' });
    await subscribe('strata@example.com', { cadence: 'weekly', scope: 'project:strata' });
    await subscribe('each@example.com');
    await subscribers.sends.drain(now());
    for (const message of delivered.splice(0)) {
      const [, id, signature] = linkOf(message, 'confirm');
      await subscribers.confirm(subscribers.verify('confirm', id, signature)!.id);
    }
    assert.deepEqual(subscribers.runDigest(), { skipped: true, queued: 0 });

    advance(60_000);
    await publishPost(posts, 'First');
    await publishPost(posts, 'Second');
    await subscribers.sends.drain(now());
    assert.deepEqual(
      delivered.splice(0).map((message) => message.to),
      ['each@example.com', 'each@example.com'],
    );

    advance(3 * 86_400_000);
    assert.deepEqual(subscribers.runDigest(), { skipped: false, queued: 1 });
    advance(3_600_000);
    await subscribers.sends.drain(now());
    assert.equal(delivered.length, 1);
    assert.equal(delivered[0].to, 'weekly@example.com');
    assert.equal(delivered[0].subject, 'This week on Project Graphite: 2 new posts');
    assert.match(delivered[0].html, /First/);
    assert.match(delivered[0].html, /Second/);
    assert.match(delivered[0].text, /Preferences: https:\/\/hub\.test\/subscribe\/manage\//);

    assert.deepEqual(subscribers.runDigest(), { skipped: true, queued: 0 });
    assert.equal(db.prepare("SELECT count(*) AS n FROM sends WHERE kind = 'digest'").get()!.n, 1);
    assert.equal(subscribers.nextDigestAt(), '2026-11-16T08:00:00.000Z');
    jobs.stop();
  });

  it('re-arms when the digest day or hour changes', async () => {
    const { subscribers, settings, bus, jobs } = setup();
    subscribers.start();
    settings['email.digest.day'] = 'wednesday';
    settings['email.digest.hour'] = 18;
    await bus.publish({
      topic: 'settings',
      key: 'email',
      kind: 'settings',
      public: true,
      summary: 'email.digest.day changed',
      detail: { key: 'email.digest.day' },
      at: new Date().toISOString(),
    });
    assert.equal(subscribers.nextDigestAt(), '2026-11-11T18:00:00.000Z');
    jobs.stop();
  });
});

describe('previews', () => {
  it('renders every email kind with placeholders filled and both parts', () => {
    const { subscribers } = setup();
    for (const kind of ['confirm', 'post', 'digest'] as const) {
      const email = subscribers.preview(kind);
      assert.doesNotMatch(email.subject, /\{\{/);
      assert.doesNotMatch(email.html, /\{\{/);
      assert.match(email.html, /<!DOCTYPE html>/);
      assert.match(email.text, /hub\.test/);
    }
  });
});
