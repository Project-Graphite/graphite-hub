import { createHmac, randomBytes } from 'node:crypto';
import { postPath } from '../app/posts.ts';
import { uploadUrl } from '../app/profile.ts';
import type { Values } from '../app/settings.ts';
import {
  describeScope,
  isCadence,
  knownScope,
  parseScope,
  scopeKey,
  scopeMatches,
  validEmail,
  type Cadence,
} from '../app/subscribe.ts';
import type { Directory } from '../app/types.ts';
import type { Bus } from './bus.ts';
import type { Database } from './db.ts';
import { digestFor, nextDigestAt, spreadDue } from './digest.ts';
import { excerptOf, renderEmail, type EmailInput, type EmailPost } from './emails.ts';
import type { Jobs } from './jobs.ts';
import type { Outgoing } from './mail.ts';
import { sameSecret } from './sessions.ts';
import { createSends, type Deliver, type SendRow } from './sends.ts';

export const DIGEST_JOB = 'digest';
export const DIGEST_REF = 'weekly';
const DIGEST_SINCE = 'email.digest.since';
const DAY_MS = 86_400_000;
const MAIL_PER_ADDRESS_PER_DAY = 3;

export type Purpose = 'confirm' | 'manage' | 'unsubscribe';
export const PURPOSES: readonly Purpose[] = ['confirm', 'manage', 'unsubscribe'];

export interface Subscriber {
  id: string;
  email: string;
  scope: string;
  cadence: Cadence;
  token: string;
  confirmedAt: string | null;
  unsubscribedAt: string | null;
  suppressedAt: string | null;
  suppressedReason: string | null;
  createdAt: string;
}

export interface Subscribing {
  email: string;
  scope: string;
  cadence: string;
  trap: string;
  address: string;
}

export type Subscribed = { ok: true } | { ok: false; reason: string };

export type PreviewKind = 'confirm' | 'post' | 'digest';

function fromRow(row: Record<string, unknown>): Subscriber {
  return {
    id: row.id as string,
    email: row.email as string,
    scope: row.scope as string,
    cadence: row.cadence as Cadence,
    token: row.token as string,
    confirmedAt: row.confirmed_at as string | null,
    unsubscribedAt: row.unsubscribed_at as string | null,
    suppressedAt: row.suppressed_at as string | null,
    suppressedReason: row.suppressed_reason as string | null,
    createdAt: row.created_at as string,
  };
}

export function active(subscriber: Subscriber) {
  return Boolean(subscriber.confirmedAt && !subscriber.unsubscribedAt && !subscriber.suppressedAt);
}

export function createSubscribers(
  db: Database,
  jobs: Jobs,
  bus: Bus,
  deps: {
    secret: string;
    origin: string;
    allow: (address: string) => Promise<boolean>;
    settings: () => Values;
    directory: () => Directory;
    deliver: Deliver;
    testAddress?: string;
    now?: () => number;
  },
) {
  const now = deps.now ?? Date.now;
  const columns =
    'SELECT id, email, scope, cadence, token, confirmed_at, unsubscribed_at, suppressed_at, suppressed_reason, created_at FROM subscribers';

  function read(id: string) {
    const row = db.prepare(`${columns} WHERE id = ?`).get(id);
    return row && fromRow(row);
  }

  function byEmail(email: string) {
    const row = db.prepare(`${columns} WHERE email = ?`).get(email);
    return row && fromRow(row);
  }

  function sign(purpose: Purpose, id: string, token: string) {
    return createHmac('sha256', deps.secret)
      .update(`${purpose}:${id}:${token}`)
      .digest('base64url')
      .slice(0, 32);
  }

  function link(purpose: Purpose, subscriber: Pick<Subscriber, 'id' | 'token'>) {
    return `${deps.origin}/subscribe/${purpose}/${subscriber.id}/${sign(purpose, subscriber.id, subscriber.token)}`;
  }

  async function changed(kind: string, subscriber: Subscriber, summary: string, at: string) {
    await bus.publish({
      topic: 'subscribers',
      kind,
      public: false,
      summary,
      detail: { id: subscriber.id, scope: subscriber.scope, cadence: subscriber.cadence },
      at,
    });
  }

  function site() {
    return { name: deps.settings()['site.name'], url: deps.origin };
  }

  function emailPost(row: Record<string, unknown>, directory: Directory): EmailPost | null {
    const author = directory.members.find((member) => member.handle === row.author);
    if (!author) {
      return null;
    }
    const project = directory.projects.find((entry) => entry.slug === row.project);
    return {
      title: row.title as string,
      summary: row.summary as string,
      excerpt: excerptOf((row.html as string | null) ?? ''),
      url: `${deps.origin}${postPath(author.path, row.slug as string)}`,
      coverUrl: row.cover_upload
        ? `${deps.origin}${uploadUrl(row.cover_upload as string, 'cover')}`
        : null,
      author: { name: author.name, url: `${deps.origin}${author.path}`, accent: author.accent },
      project: project ? { name: project.name, url: `${deps.origin}${project.path}` } : null,
      publishedAt: row.published_at as string,
      readingMinutes: (row.reading_minutes as number | null) ?? 1,
    };
  }

  const postColumns =
    "SELECT id, author, slug, title, summary, html, cover_upload, project, published_at, reading_minutes FROM posts WHERE status = 'published'";

  function publishedBetween(since: string, until: string) {
    return db
      .prepare(
        `${postColumns} AND published_at > ? AND published_at <= ? ORDER BY published_at DESC`,
      )
      .all(since, until);
  }

  function rendered(input: EmailInput) {
    return renderEmail(input, deps.settings(), site());
  }

  function outgoing(to: string, input: EmailInput, unsubscribeUrl: string | null): Outgoing {
    const settings = deps.settings();
    return {
      from: { name: settings['email.from.name'] },
      replyTo: settings['email.reply_to'] || null,
      to,
      ...rendered(input),
      unsubscribeUrl,
    };
  }

  async function compose(send: SendRow): Promise<Outgoing | null> {
    const subscriber = read(send.subscriber);
    if (!subscriber || subscriber.suppressedAt) {
      return null;
    }
    const directory = deps.directory();
    const what = describeScope(parseScope(subscriber.scope) ?? { kind: 'all' }, directory);
    const links = {
      manage: link('manage', subscriber),
      unsubscribe: link('unsubscribe', subscriber),
    };
    switch (send.kind) {
      case 'confirm':
        return subscriber.confirmedAt && !subscriber.unsubscribedAt
          ? null
          : outgoing(
              subscriber.email,
              { kind: 'confirm', what, confirmUrl: link('confirm', subscriber) },
              null,
            );
      case 'manage':
        return outgoing(subscriber.email, { kind: 'manage', what, links }, null);
      case 'post': {
        const row = db.prepare(`${postColumns} AND id = ?`).get(send.ref ?? '');
        const post = row && active(subscriber) ? emailPost(row, directory) : null;
        return post
          ? outgoing(subscriber.email, { kind: 'post', what, post, links }, links.unsubscribe)
          : null;
      }
      case 'digest': {
        const [since, until] = (send.ref ?? '').split('/');
        const posts = digestFor(
          subscriber.scope,
          publishedBetween(since, until).map((row) => ({
            author: row.author as string,
            project: row.project as string | null,
            row,
          })),
        ).flatMap(({ row }) => emailPost(row, directory) ?? []);
        return posts.length > 0 && active(subscriber)
          ? outgoing(
              subscriber.email,
              { kind: 'digest', what, posts, since, links },
              links.unsubscribe,
            )
          : null;
      }
    }
  }

  const sends = createSends(db, jobs, {
    deliver: deps.deliver,
    compose,
    perHour: () => deps.settings()['email.hourly'],
    bounced(id, reason, at) {
      db.prepare(
        'UPDATE subscribers SET suppressed_at = ?, suppressed_reason = ?, updated_at = ? WHERE id = ?',
      ).run(at, reason, at, id);
      const subscriber = read(id);
      if (subscriber) {
        changed('bounced', subscriber, 'An address bounced and was suppressed', at).catch(() => {});
      }
    },
  });

  function mailedToday(subscriber: string) {
    return db
      .prepare(
        "SELECT count(*) AS count FROM sends WHERE subscriber = ? AND kind IN ('confirm', 'manage') AND created_at > ?",
      )
      .get(subscriber, new Date(now() - DAY_MS).toISOString())!.count as number;
  }

  function armDigest() {
    const settings = deps.settings();
    jobs.add(
      DIGEST_JOB,
      DIGEST_REF,
      nextDigestAt(now(), settings['email.digest.day'], settings['email.digest.hour']),
    );
  }

  function nextDigest() {
    return db
      .prepare('SELECT due_at FROM jobs WHERE kind = ? AND ref = ? AND done_at IS NULL')
      .get(DIGEST_JOB, DIGEST_REF)?.due_at as string | undefined;
  }

  bus.listen(({ event }) => {
    if (event.topic === 'settings' && String(event.detail.key).startsWith('email.digest.')) {
      armDigest();
    }
  });

  function activeWith(cadence: Cadence) {
    return db
      .prepare(
        `${columns} WHERE cadence = ? AND confirmed_at IS NOT NULL AND unsubscribed_at IS NULL AND suppressed_at IS NULL ORDER BY created_at`,
      )
      .all(cadence)
      .map(fromRow);
  }

  function samplePosts(count: number) {
    const directory = deps.directory();
    const posts = db
      .prepare(`${postColumns} ORDER BY published_at DESC LIMIT ?`)
      .all(count)
      .flatMap((row) => emailPost(row, directory) ?? []);
    if (posts.length > 0) {
      return posts;
    }
    const author = directory.members[0];
    return [
      {
        title: 'A post that does not exist yet',
        summary: 'The summary of the post goes here, in one or two lines.',
        excerpt:
          'The first paragraphs of the post follow the summary, so a reader can decide whether to open it. This is what the email will look like once the members publish.',
        url: `${deps.origin}/blog`,
        coverUrl: null,
        author: {
          name: author?.name ?? 'A member',
          url: `${deps.origin}${author?.path ?? '/members'}`,
          accent: author?.accent ?? '#6f8fd1',
        },
        project: null,
        publishedAt: new Date(now()).toISOString(),
        readingMinutes: 3,
      },
    ];
  }

  function sample(kind: PreviewKind): EmailInput {
    const what = 'every post';
    const links = {
      manage: `${deps.origin}/subscribe/manage/preview/preview`,
      unsubscribe: `${deps.origin}/subscribe/unsubscribe/preview/preview`,
    };
    switch (kind) {
      case 'confirm':
        return { kind, what, confirmUrl: `${deps.origin}/subscribe/confirm/preview/preview` };
      case 'post':
        return { kind, what, post: samplePosts(1)[0], links };
      case 'digest':
        return {
          kind,
          what,
          posts: samplePosts(3),
          since: new Date(now() - 7 * DAY_MS).toISOString(),
          links,
        };
    }
  }

  return {
    read,
    link,
    sends,
    armDigest,

    start() {
      if (!jobs.pending(DIGEST_JOB, DIGEST_REF)) {
        armDigest();
      }
      sends.arm();
    },

    count() {
      return db
        .prepare(
          'SELECT count(*) AS count FROM subscribers WHERE confirmed_at IS NOT NULL AND unsubscribed_at IS NULL AND suppressed_at IS NULL',
        )
        .get()!.count as number;
    },

    async subscribe(subscribing: Subscribing): Promise<Subscribed> {
      if (subscribing.trap) {
        return { ok: true };
      }
      const email = subscribing.email.trim().toLowerCase();
      const scope = parseScope(subscribing.scope);
      if (!validEmail(email)) {
        return { ok: false, reason: 'That does not look like an email address.' };
      }
      if (!scope || !knownScope(scope, deps.directory()) || !isCadence(subscribing.cadence)) {
        return { ok: false, reason: 'Pick what to follow and how often.' };
      }
      if (!(await deps.allow(subscribing.address))) {
        return { ok: false, reason: 'That is a lot of subscribing; try again in a while.' };
      }
      const at = new Date(now()).toISOString();
      const existing = byEmail(email);
      if (existing && mailedToday(existing.id) >= MAIL_PER_ADDRESS_PER_DAY) {
        return { ok: false, reason: 'Three emails went to that address today; look for them.' };
      }
      let subscriber: Subscriber;
      if (existing && active(existing)) {
        subscriber = existing;
        sends.queue(existing.id, 'manage', null, at);
      } else if (existing) {
        db.prepare(
          `UPDATE subscribers SET scope = ?, cadence = ?, token = ?, confirmed_at = NULL, unsubscribed_at = NULL,
             suppressed_at = NULL, suppressed_reason = NULL, updated_at = ? WHERE id = ?`,
        ).run(
          scopeKey(scope),
          subscribing.cadence,
          randomBytes(24).toString('base64url'),
          at,
          existing.id,
        );
        subscriber = read(existing.id)!;
        sends.queue(subscriber.id, 'confirm', null, at);
      } else {
        const id = randomBytes(8).toString('hex');
        db.prepare(
          'INSERT INTO subscribers (id, email, scope, cadence, token, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        ).run(
          id,
          email,
          scopeKey(scope),
          subscribing.cadence,
          randomBytes(24).toString('base64url'),
          at,
          at,
        );
        subscriber = read(id)!;
        sends.queue(id, 'confirm', null, at);
      }
      sends.arm(now());
      await changed('asked', subscriber, 'Someone asked to subscribe', at);
      return { ok: true };
    },

    verify(purpose: string, id: string, signature: string) {
      const subscriber = read(id);
      if (!PURPOSES.includes(purpose as Purpose) || !subscriber) {
        return undefined;
      }
      return sameSecret(sign(purpose as Purpose, id, subscriber.token), signature)
        ? subscriber
        : undefined;
    },

    async confirm(id: string) {
      const at = new Date(now()).toISOString();
      db.prepare(
        'UPDATE subscribers SET confirmed_at = coalesce(confirmed_at, ?), unsubscribed_at = NULL, updated_at = ? WHERE id = ?',
      ).run(at, at, id);
      const subscriber = read(id)!;
      await changed('confirmed', subscriber, 'A subscriber confirmed', at);
      return subscriber;
    },

    async update(id: string, scopeValue: string, cadence: string) {
      const scope = parseScope(scopeValue);
      if (!scope || !knownScope(scope, deps.directory()) || !isCadence(cadence)) {
        return { ok: false as const, reason: 'Pick what to follow and how often.' };
      }
      const at = new Date(now()).toISOString();
      db.prepare('UPDATE subscribers SET scope = ?, cadence = ?, updated_at = ? WHERE id = ?').run(
        scopeKey(scope),
        cadence,
        at,
        id,
      );
      await changed('changed', read(id)!, 'A subscriber changed their preferences', at);
      return { ok: true as const };
    },

    async unsubscribe(id: string) {
      const at = new Date(now()).toISOString();
      db.prepare(
        'UPDATE subscribers SET unsubscribed_at = coalesce(unsubscribed_at, ?), updated_at = ? WHERE id = ?',
      ).run(at, at, id);
      db.prepare(
        "UPDATE sends SET status = 'failed', error = 'unsubscribed' WHERE subscriber = ? AND status = 'queued' AND kind IN ('post', 'digest')",
      ).run(id);
      await changed('unsubscribed', read(id)!, 'A subscriber left', at);
    },

    async resubscribe(id: string) {
      const at = new Date(now()).toISOString();
      db.prepare(
        'UPDATE subscribers SET unsubscribed_at = NULL, updated_at = ? WHERE id = ? AND confirmed_at IS NOT NULL',
      ).run(at, id);
      await changed('confirmed', read(id)!, 'A subscriber came back', at);
    },

    queuePost(post: { id: string; author: string; project: string | null }) {
      const at = now();
      const perHour = deps.settings()['email.hourly'];
      let queued = 0;
      for (const subscriber of activeWith('each')) {
        const scope = parseScope(subscriber.scope);
        if (
          scope &&
          scopeMatches(scope, post) &&
          sends.queue(subscriber.id, 'post', post.id, spreadDue(at, queued, perHour))
        ) {
          queued += 1;
        }
      }
      if (queued > 0) {
        sends.arm(at);
      }
      return queued;
    },

    runDigest() {
      const at = now();
      const until = new Date(at).toISOString();
      const since =
        (db.prepare('SELECT value FROM state WHERE key = ?').get(DIGEST_SINCE)?.value as
          string | undefined) ?? new Date(at - 7 * DAY_MS).toISOString();
      const posts = publishedBetween(since, until).map((row) => ({
        author: row.author as string,
        project: row.project as string | null,
      }));
      armDigest();
      if (posts.length === 0) {
        return { skipped: true, queued: 0 };
      }
      const perHour = deps.settings()['email.hourly'];
      let queued = 0;
      for (const subscriber of activeWith('weekly')) {
        if (
          digestFor(subscriber.scope, posts).length > 0 &&
          sends.queue(subscriber.id, 'digest', `${since}/${until}`, spreadDue(at, queued, perHour))
        ) {
          queued += 1;
        }
      }
      db.prepare(
        'INSERT INTO state (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
      ).run(DIGEST_SINCE, until);
      sends.arm(at);
      return { skipped: false, queued };
    },

    nextDigestAt: nextDigest,

    preview(kind: PreviewKind) {
      return rendered(sample(kind));
    },

    sendTest(kind: PreviewKind, to: string) {
      return deps.deliver(outgoing(to, sample(kind), null));
    },

    overview() {
      const rows = db.prepare(columns).all().map(fromRow);
      const live = rows.filter(active);
      const scopes = new Map<string, number>();
      for (const subscriber of live) {
        scopes.set(subscriber.scope, (scopes.get(subscriber.scope) ?? 0) + 1);
      }
      const emails = new Map(rows.map((row) => [row.id, row.email]));
      return {
        testTo: deps.testAddress ?? '',
        nextDigestAt: nextDigest() ?? null,
        confirmed: live.length,
        pending: rows.filter((row) => !row.confirmedAt).length,
        unsubscribed: rows.filter((row) => row.confirmedAt && row.unsubscribedAt).length,
        weekly: live.filter((row) => row.cadence === 'weekly').length,
        each: live.filter((row) => row.cadence === 'each').length,
        scopes: [...scopes]
          .map(([scope, count]) => ({ scope, count }))
          .sort((a, b) => b.count - a.count),
        sends: sends.counts(),
        recent: sends.recent(20).map((send) => ({
          id: send.id,
          email: emails.get(send.subscriber) ?? 'gone',
          kind: send.kind,
          status: send.status,
          at: send.sentAt ?? send.dueAt,
          attempts: send.attempts,
          error: send.error,
        })),
        bounces: rows
          .filter((row) => row.suppressedAt)
          .sort((a, b) => b.suppressedAt!.localeCompare(a.suppressedAt!))
          .slice(0, 20)
          .map((row) => ({
            id: row.id,
            email: row.email,
            at: row.suppressedAt!,
            reason: row.suppressedReason ?? '',
          })),
      };
    },
  };
}

export type Subscribers = ReturnType<typeof createSubscribers>;
