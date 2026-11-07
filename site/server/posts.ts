import { randomBytes } from 'node:crypto';
import {
  isPostStatus,
  postPath,
  postProblem,
  publishable,
  slugify,
  type Post,
  type PostFields,
  type PostStatus,
  type PostSummary,
  type PostTemplate,
  type PostVersion,
} from '../app/posts.ts';
import { Refused, uploadUrl } from '../app/profile.ts';
import type { Bus } from './bus.ts';
import { json, transaction, type Database } from './db.ts';
import { atom, rss } from './feeds.ts';
import type { Jobs } from './jobs.ts';
import { jsonToState, render, stateToJson, type Rendered } from './render.ts';
import { BUILT_IN_TEMPLATES } from './templates.ts';

const PUBLISH_JOB = 'publish';

export interface Viewer {
  handle: string | null;
  owner: boolean;
}

export interface Access {
  edit: boolean;
  manage: boolean;
}

function fromRow(row: Record<string, unknown>): Post {
  return {
    id: row.id as string,
    author: row.author as string,
    slug: row.slug as string,
    title: row.title as string,
    summary: row.summary as string,
    tags: json(row.tags),
    project: row.project as string | null,
    coverUpload: row.cover_upload as string | null,
    editors: json(row.editors),
    status: row.status as PostStatus,
    publishAt: row.publish_at as string | null,
    publishedAt: row.published_at as string | null,
    readingMinutes: row.reading_minutes as number | null,
    beforeTrash: row.before_trash as PostStatus | null,
    trashedAt: row.trashed_at as string | null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    updatedBy: row.updated_by as string,
  };
}

export function accessTo(post: Pick<Post, 'author' | 'editors'>, viewer: Viewer): Access {
  const manage = viewer.owner || viewer.handle === post.author;
  return {
    manage,
    edit: manage || (viewer.handle !== null && post.editors.includes(viewer.handle)),
  };
}

export function readPublished(db: Database, pathOf: (author: string) => string | undefined) {
  return db
    .prepare(
      `SELECT id, slug, title, summary, author, project, tags, cover_upload, published_at, reading_minutes
         FROM posts WHERE status = 'published' ORDER BY published_at DESC, id`,
    )
    .all()
    .flatMap((row): PostSummary[] => {
      const authorPath = pathOf(row.author as string);
      return authorPath
        ? [
            {
              id: row.id as string,
              slug: row.slug as string,
              title: row.title as string,
              summary: row.summary as string,
              author: row.author as string,
              project: row.project as string | null,
              tags: json(row.tags),
              coverUrl: row.cover_upload ? uploadUrl(row.cover_upload as string, 'cover') : null,
              publishedAt: row.published_at as string,
              readingMinutes: row.reading_minutes as number,
              path: postPath(authorPath, row.slug as string),
            },
          ]
        : [];
    });
}

export function createPosts(
  db: Database,
  bus: Bus,
  jobs: Jobs,
  onPublished: (post: Post) => void = () => {},
) {
  const known = {
    upload: (id: string) => Boolean(db.prepare('SELECT 1 FROM uploads WHERE id = ?').get(id)),
    member: (handle: string) =>
      Boolean(db.prepare('SELECT 1 FROM members WHERE handle = ?').get(handle)),
    project: (slug: string) =>
      Boolean(db.prepare('SELECT 1 FROM projects WHERE slug = ?').get(slug)),
  };

  function read(id: string): Post | undefined {
    const row = db
      .prepare(
        'SELECT id, author, slug, title, summary, tags, project, cover_upload, editors, status, publish_at, published_at, reading_minutes, before_trash, trashed_at, created_at, updated_at, updated_by FROM posts WHERE id = ?',
      )
      .get(id);
    return row && fromRow(row);
  }

  function must(id: string) {
    const post = read(id);
    if (!post) {
      throw new Refused('That post does not exist.');
    }
    return post;
  }

  function state(id: string) {
    const row = db.prepare('SELECT doc FROM posts WHERE id = ?').get(id);
    return row?.doc ? new Uint8Array(row.doc as Uint8Array) : null;
  }

  function touch(id: string, by: string, at: string) {
    db.prepare('UPDATE posts SET updated_at = ?, updated_by = ? WHERE id = ?').run(at, by, id);
  }

  async function changed(post: Post, by: string, kind: string, at: string, summary: string) {
    await bus.publish({
      topic: 'posts',
      key: post.id,
      kind,
      public: false,
      actor: by,
      summary,
      detail: { id: post.id, author: post.author, status: post.status },
      at,
    });
  }

  function freeSlug(author: string, wanted: string, except: string) {
    const taken = new Set(
      db
        .prepare('SELECT slug FROM posts WHERE author = ? AND id <> ?')
        .all(author, except)
        .map((row) => row.slug as string),
    );
    let slug = wanted;
    for (let n = 2; taken.has(slug); n += 1) {
      slug = `${wanted}-${n}`;
    }
    return slug;
  }

  function keepVersion(
    post: Post,
    by: string,
    at: string,
    label: string | null,
    doc: Uint8Array | null = state(post.id),
  ) {
    db.prepare("INSERT INTO versions (kind, key, blob, by, at) VALUES ('post', ?, ?, ?, ?)").run(
      post.id,
      JSON.stringify({
        label,
        title: post.title,
        summary: post.summary,
        tags: post.tags,
        project: post.project,
        coverUpload: post.coverUpload,
        doc: doc ? Buffer.from(doc).toString('base64') : null,
      }),
      by,
      at,
    );
  }

  function store(id: string, rendered: Rendered, status: PostStatus, at: string, by: string) {
    db.prepare(
      `UPDATE posts SET status = ?, published_at = coalesce(published_at, ?), publish_at = NULL, html = ?,
         reading_minutes = ?, updated_at = ?, updated_by = ? WHERE id = ?`,
    ).run(status, at, rendered.html, rendered.readingMinutes, at, by, id);
  }

  async function publish(id: string, by: string) {
    const post = must(id);
    const problem = publishable(post);
    if (problem) {
      throw new Refused(problem);
    }
    if (!(await bus.alive())) {
      throw new Refused('The live stream is unreachable; try again in a moment.');
    }
    const at = new Date().toISOString();
    const rendered = render(state(id));
    transaction(db, () => {
      store(id, rendered, 'published', at, by);
      keepVersion(post, by, at, 'published');
    });
    jobs.cancel(PUBLISH_JOB, id);
    const published = must(id);
    onPublished(published);
    await bus.record({
      topic: 'posts',
      key: id,
      kind: 'post',
      public: true,
      actor: by,
      summary: `${post.author} published “${post.title}”`,
      detail: {
        id,
        author: post.author,
        title: post.title,
        slug: post.slug,
        project: post.project,
      },
      at,
    });
    return published;
  }

  return {
    read,
    accessTo,
    state,
    rss,
    atom,

    async create(author: string, by: string, template: string | null) {
      const id = randomBytes(8).toString('hex');
      const at = new Date().toISOString();
      const content =
        BUILT_IN_TEMPLATES.find((candidate) => candidate.id === template)?.content ??
        (template
          ? json<object>(
              db.prepare('SELECT content FROM post_templates WHERE id = ?').get(template)?.content,
            )
          : BUILT_IN_TEMPLATES[0].content);
      db.prepare(
        `INSERT INTO posts (id, author, slug, doc, created_at, updated_at, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        author,
        freeSlug(author, `untitled-${id.slice(0, 6)}`, id),
        jsonToState(content),
        at,
        at,
        by,
      );
      await changed(must(id), by, 'created', at, `${author} started a draft`);
      return id;
    },

    async save(id: string, fields: PostFields, by: string) {
      const post = must(id);
      const next: PostFields = {
        title: String(fields.title ?? '').trim(),
        slug: fields.slug || slugify(fields.title ?? '') || post.slug,
        summary: String(fields.summary ?? '').trim(),
        tags: fields.tags,
        project: fields.project,
        coverUpload: fields.coverUpload,
        editors: fields.editors,
      };
      const problem = postProblem(next, known);
      if (problem) {
        throw new Refused(problem);
      }
      const slug = freeSlug(post.author, next.slug, id);
      const at = new Date().toISOString();
      db.prepare(
        `UPDATE posts SET title = ?, slug = ?, summary = ?, tags = ?, project = ?, cover_upload = ?, editors = ?,
           updated_at = ?, updated_by = ? WHERE id = ?`,
      ).run(
        next.title,
        slug,
        next.summary,
        JSON.stringify(next.tags),
        next.project,
        next.coverUpload,
        JSON.stringify(next.editors),
        at,
        by,
        id,
      );
      const saved = must(id);
      await changed(saved, by, 'settings', at, `${by} changed a draft`);
      return saved;
    },

    storeDoc(id: string, doc: Uint8Array, by: string) {
      const at = new Date().toISOString();
      db.prepare('UPDATE posts SET doc = ?, updated_at = ?, updated_by = ? WHERE id = ?').run(
        doc,
        at,
        by,
        id,
      );
    },

    publish,

    async schedule(id: string, publishAt: string, by: string) {
      const post = must(id);
      const problem = publishable(post);
      if (problem) {
        throw new Refused(problem);
      }
      if (Number.isNaN(Date.parse(publishAt)) || Date.parse(publishAt) <= Date.now()) {
        throw new Refused('Pick a time in the future, or publish now.');
      }
      const at = new Date().toISOString();
      const due = new Date(publishAt).toISOString();
      db.prepare(
        "UPDATE posts SET status = 'scheduled', publish_at = ?, updated_at = ?, updated_by = ? WHERE id = ?",
      ).run(due, at, by, id);
      jobs.add(PUBLISH_JOB, id, due);
      await changed(must(id), by, 'scheduled', at, `${by} scheduled a post`);
    },

    async publishDue(id: string) {
      if (read(id)?.status === 'scheduled') {
        await publish(id, 'schedule');
      }
    },

    async unpublish(id: string, by: string) {
      const post = must(id);
      const at = new Date().toISOString();
      db.prepare(
        "UPDATE posts SET status = 'draft', publish_at = NULL, updated_at = ?, updated_by = ? WHERE id = ?",
      ).run(at, by, id);
      jobs.cancel(PUBLISH_JOB, id);
      await bus.publish({
        topic: 'posts',
        key: id,
        kind: 'unpublished',
        public: false,
        actor: by,
        summary: `${by} took “${post.title}” back to drafts`,
        detail: { id, author: post.author, status: 'draft' },
        at,
      });
    },

    async trash(id: string, by: string) {
      const post = must(id);
      if (post.status === 'trashed') {
        return;
      }
      const at = new Date().toISOString();
      db.prepare(
        "UPDATE posts SET status = 'trashed', before_trash = ?, trashed_at = ?, publish_at = NULL, updated_at = ?, updated_by = ? WHERE id = ?",
      ).run(post.status, at, at, by, id);
      jobs.cancel(PUBLISH_JOB, id);
      await changed(must(id), by, 'trashed', at, `${by} trashed a post`);
    },

    async restore(id: string, by: string) {
      const post = must(id);
      if (post.status !== 'trashed') {
        return;
      }
      const at = new Date().toISOString();
      const back = post.beforeTrash === 'published' ? 'published' : 'draft';
      db.prepare(
        'UPDATE posts SET status = ?, before_trash = NULL, trashed_at = NULL, updated_at = ?, updated_by = ? WHERE id = ?',
      ).run(back, at, by, id);
      await changed(must(id), by, 'restored', at, `${by} restored a post`);
    },

    async remove(id: string, by: string) {
      const post = must(id);
      transaction(db, () => {
        db.prepare('DELETE FROM posts WHERE id = ?').run(id);
        db.prepare("DELETE FROM versions WHERE kind = 'post' AND key = ?").run(id);
      });
      jobs.cancel(PUBLISH_JOB, id);
      await changed(post, by, 'removed', new Date().toISOString(), `${by} deleted a post`);
    },

    versions(id: string): PostVersion[] {
      return db
        .prepare(
          "SELECT id, by, at, blob FROM versions WHERE kind = 'post' AND key = ? ORDER BY id DESC LIMIT 50",
        )
        .all(id)
        .map((row) => {
          const blob = json<{ title: string; label: string | null }>(row.blob);
          return {
            id: row.id as number,
            by: row.by as string,
            at: row.at as string,
            title: blob.title,
            label: blob.label,
          };
        });
    },

    async keep(id: string, by: string, label: string | null) {
      const post = must(id);
      const at = new Date().toISOString();
      keepVersion(post, by, at, label);
      touch(id, by, at);
      await changed(post, by, 'version', at, `${by} kept a version`);
    },

    snapshot(id: string, by: string, doc: Uint8Array) {
      const post = read(id);
      if (!post) {
        return;
      }
      const last = db
        .prepare("SELECT at FROM versions WHERE kind = 'post' AND key = ? ORDER BY id DESC LIMIT 1")
        .get(id)?.at as string | undefined;
      if (last && Date.now() - Date.parse(last) < 15 * 60_000) {
        return;
      }
      keepVersion(post, by, new Date().toISOString(), null, doc);
    },

    versionContent(id: string, versionId: number) {
      const row = db
        .prepare("SELECT blob FROM versions WHERE kind = 'post' AND key = ? AND id = ?")
        .get(id, versionId);
      if (!row) {
        throw new Refused('That version is gone.');
      }
      const blob = json<{ doc: string | null }>(row.blob);
      return stateToJson(blob.doc ? new Uint8Array(Buffer.from(blob.doc, 'base64')) : null);
    },

    async restored(id: string, versionId: number, by: string) {
      const post = must(id);
      const at = new Date().toISOString();
      keepVersion(post, by, at, `before restoring version ${versionId}`);
      touch(id, by, at);
      await changed(post, by, 'version', at, `${by} restored a version`);
    },

    preview(id: string) {
      return render(state(id));
    },

    html(id: string) {
      return db.prepare('SELECT html FROM posts WHERE id = ?').get(id)?.html as string | null;
    },

    bySlug(author: string, slug: string) {
      const row = db
        .prepare('SELECT id FROM posts WHERE author = ? AND slug = ?')
        .get(author, slug);
      return row ? read(row.id as string) : undefined;
    },

    byAuthor(author: string | null): Post[] {
      return db
        .prepare(
          `SELECT id, author, slug, title, summary, tags, project, cover_upload, editors, status, publish_at, published_at, reading_minutes, before_trash, trashed_at, created_at, updated_at, updated_by
             FROM posts WHERE (? IS NULL OR author = ? OR editors LIKE ?) ORDER BY updated_at DESC, rowid DESC`,
        )
        .all(author, author, author ? `%"${author}"%` : null)
        .map(fromRow);
    },

    templates(by: string): PostTemplate[] {
      return [
        ...BUILT_IN_TEMPLATES.map(({ id, name }) => ({ id, name, by: null })),
        ...db
          .prepare('SELECT id, name, by FROM post_templates WHERE by = ? ORDER BY created_at DESC')
          .all(by)
          .map((row) => ({ id: row.id as string, name: row.name as string, by: row.by as string })),
      ];
    },

    async saveTemplate(id: string, name: string, by: string) {
      must(id);
      const trimmed = name.trim();
      if (trimmed === '' || trimmed.length > 40) {
        throw new Refused('Name the template in up to 40 characters.');
      }
      const templateId = randomBytes(6).toString('hex');
      db.prepare(
        'INSERT INTO post_templates (id, name, by, content, created_at) VALUES (?, ?, ?, ?, ?)',
      ).run(
        templateId,
        trimmed,
        by,
        JSON.stringify(stateToJson(state(id))),
        new Date().toISOString(),
      );
      return templateId;
    },

    removeTemplate(id: string, by: string) {
      db.prepare('DELETE FROM post_templates WHERE id = ? AND by = ?').run(id, by);
    },

    statusOf(status: unknown) {
      return isPostStatus(status) ? status : undefined;
    },
  };
}

export type Posts = ReturnType<typeof createPosts>;
