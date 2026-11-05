import {
  aliasProblem,
  blocksProblem,
  defaultBlocks,
  fieldsProblem,
  shortLinkProblem,
  type Block,
  type Profile,
  type ProfileFields,
  type ShortLink,
} from '../app/profile.ts';
import type { Bus } from './bus.ts';
import { json, transaction, type Database } from './db.ts';

export class ProfileRefused extends Error {}

export interface ProfileVersion {
  id: number;
  by: string;
  at: string;
}

export interface ProfileChange {
  fields?: Partial<ProfileFields>;
  blocks?: Block[];
}

function withIds(blocks: Omit<Block, 'id'>[]): Block[] {
  return blocks.map((block, index) => ({ id: `${block.type}-${index}`, ...block }) as Block);
}

export function createProfiles(db: Database, bus: Bus) {
  function uploadsOf(handle: string) {
    return new Set(
      db
        .prepare('SELECT id FROM uploads WHERE owner = ?')
        .all(handle)
        .map((row) => row.id as string),
    );
  }

  function read(handle: string): Profile {
    const row = db.prepare('SELECT * FROM profiles WHERE handle = ?').get(handle);
    const stored = withIds(json<Omit<Block, 'id'>[]>(row?.blocks ?? '[]'));
    const edited = Boolean(row?.edited_at);
    return {
      handle,
      alias: (row?.alias as string | null) ?? null,
      headline: (row?.headline as string | null) ?? null,
      bio: (row?.bio as string | null) ?? null,
      accent: (row?.accent as string | null) ?? null,
      avatarUpload: (row?.avatar_upload as string | null) ?? null,
      coverUpload: (row?.cover_upload as string | null) ?? null,
      listed: row ? row.listed === 1 : true,
      blocks: edited ? stored : defaultBlocks(stored),
      edited,
    };
  }

  function taken(handle: string) {
    return {
      slugs: new Set(
        db
          .prepare('SELECT slug FROM projects')
          .all()
          .map((row) => row.slug as string),
      ),
      aliases: new Set(
        db
          .prepare('SELECT alias FROM profiles WHERE alias IS NOT NULL AND handle <> ?')
          .all(handle)
          .map((row) => row.alias as string),
      ),
    };
  }

  async function changed(handle: string, by: string, at: string) {
    await bus.publish({
      topic: 'profiles',
      key: handle,
      kind: 'profile',
      public: true,
      actor: by,
      summary: `${handle}'s page changed`,
      detail: { handle },
      at,
    });
  }

  function write(profile: Profile, by: string, at: string, edited: boolean) {
    db.prepare(
      `INSERT INTO profiles (handle, alias, headline, bio, accent, avatar_upload, cover_upload, listed, blocks, edited_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (handle) DO UPDATE SET alias = excluded.alias, headline = excluded.headline,
         bio = excluded.bio, accent = excluded.accent, avatar_upload = excluded.avatar_upload,
         cover_upload = excluded.cover_upload, listed = excluded.listed, blocks = excluded.blocks,
         edited_at = excluded.edited_at, updated_at = excluded.updated_at`,
    ).run(
      profile.handle,
      profile.alias,
      profile.headline,
      profile.bio,
      profile.accent,
      profile.avatarUpload,
      profile.coverUpload,
      profile.listed ? 1 : 0,
      JSON.stringify(profile.blocks),
      edited ? at : null,
      at,
    );
    db.prepare("INSERT INTO versions (kind, key, blob, by, at) VALUES ('profile', ?, ?, ?, ?)").run(
      profile.handle,
      JSON.stringify(profile),
      by,
      at,
    );
  }

  async function save(handle: string, change: ProfileChange, by: string) {
    const current = read(handle);
    const next: Profile = {
      ...current,
      ...change.fields,
      blocks: change.blocks ?? current.blocks,
    };
    const uploads = uploadsOf(handle);
    const problem =
      (change.fields?.alias != null && change.fields.alias !== current.alias
        ? aliasProblem(change.fields.alias, taken(handle))
        : null) ??
      fieldsProblem(change.fields ?? {}, uploads) ??
      (change.blocks ? blocksProblem(change.blocks, uploads) : null);
    if (problem) {
      throw new ProfileRefused(problem);
    }
    const at = new Date().toISOString();
    transaction(db, () => write(next, by, at, true));
    await changed(handle, by, at);
    return read(handle);
  }

  return {
    read,
    save,

    handleForAlias(alias: string) {
      return db.prepare('SELECT handle FROM profiles WHERE alias = ?').get(alias)?.handle as
        string | undefined;
    },

    history(handle: string): ProfileVersion[] {
      return db
        .prepare(
          "SELECT id, by, at FROM versions WHERE kind = 'profile' AND key = ? ORDER BY id DESC LIMIT 50",
        )
        .all(handle)
        .map((row) => ({ id: row.id as number, by: row.by as string, at: row.at as string }));
    },

    async undo(handle: string, by: string) {
      const [, previous] = db
        .prepare(
          "SELECT blob FROM versions WHERE kind = 'profile' AND key = ? ORDER BY id DESC LIMIT 2",
        )
        .all(handle);
      if (!previous) {
        throw new ProfileRefused('There is nothing to undo.');
      }
      return this.revertTo(handle, json<Profile>(previous.blob), by);
    },

    async revert(handle: string, version: number, by: string) {
      const row = db
        .prepare("SELECT blob FROM versions WHERE kind = 'profile' AND key = ? AND id = ?")
        .get(handle, version);
      if (!row) {
        throw new ProfileRefused(`Version ${version} is not one of ${handle}'s.`);
      }
      return this.revertTo(handle, json<Profile>(row.blob), by);
    },

    async revertTo(handle: string, profile: Profile, by: string) {
      const { alias, headline, bio, accent, avatarUpload, coverUpload, listed, blocks } = profile;
      return save(
        handle,
        { fields: { alias, headline, bio, accent, avatarUpload, coverUpload, listed }, blocks },
        by,
      );
    },

    async reset(handle: string, by: string) {
      const current = read(handle);
      const at = new Date().toISOString();
      transaction(db, () =>
        write(
          {
            ...current,
            avatarUpload: null,
            coverUpload: null,
            blocks: defaultBlocks(current.blocks),
          },
          by,
          at,
          false,
        ),
      );
      await changed(handle, by, at);
      return read(handle);
    },

    shortLinks(handle: string, all = false): ShortLink[] {
      return db
        .prepare(
          `SELECT name, url, listed FROM short_links WHERE handle = ? ${all ? '' : 'AND listed = 1'} ORDER BY name`,
        )
        .all(handle)
        .map((row) => ({
          name: row.name as string,
          url: row.url as string,
          listed: row.listed === 1,
        }));
    },

    shortLink(handle: string, name: string) {
      return db
        .prepare('SELECT url FROM short_links WHERE handle = ? AND name = ?')
        .get(handle, name)?.url as string | undefined;
    },

    async setShortLink(handle: string, link: ShortLink, by: string) {
      const problem =
        shortLinkProblem(link) ??
        (this.shortLinks(handle, true).length >= 30 && !this.shortLink(handle, link.name)
          ? 'A member has at most 30 short links.'
          : null);
      if (problem) {
        throw new ProfileRefused(problem);
      }
      const at = new Date().toISOString();
      db.prepare(
        `INSERT INTO short_links (handle, name, url, listed, created_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (handle, name) DO UPDATE SET url = excluded.url, listed = excluded.listed`,
      ).run(handle, link.name, link.url, link.listed ? 1 : 0, at);
      await changed(handle, by, at);
    },

    async removeShortLink(handle: string, name: string, by: string) {
      db.prepare('DELETE FROM short_links WHERE handle = ? AND name = ?').run(handle, name);
      await changed(handle, by, new Date().toISOString());
    },
  };
}

export type Profiles = ReturnType<typeof createProfiles>;
