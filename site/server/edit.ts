import Ajv2020, { type ErrorObject, type ValidateFunction } from 'ajv/dist/2020.js';
import {
  OWNER_ONLY_FIELDS,
  TARGET_UPLOADS,
  type EditPatch,
  type EditResult,
  type EditTarget,
  type EditVersion,
  type ProjectFields,
} from '../app/editing/contract.ts';
import { PROJECT_LIMITS, STATUSES } from '../app/presentation.ts';
import {
  BLOCK_TYPES,
  isRefused,
  LIMITS,
  PROFILE_FIELDS,
  type Profile,
  type UploadKind,
} from '../app/profile.ts';
import { isSettingKey, SETTINGS } from '../app/settings.ts';
import type { Viewer } from '../app/types.ts';
import { json, type Database } from './db.ts';
import { fieldsOf as profileFields, type Profiles } from './profiles.ts';
import { fieldsOf as projectFields, type Projects } from './projects.ts';
import { SettingRefused, type Settings } from './settings.ts';
import type { Uploads } from './uploads.ts';

const HANDLE = '^[a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?$';
const LOGIN = '^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$';
const SLUG = '^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$';
const HEX = '^#[0-9a-fA-F]{6}$';
const UPLOAD = '^[0-9a-f]{24}$';
const HISTORY = 20;

const between = ({ min, max }: { min: number; max: number }) => ({
  type: 'string',
  minLength: min,
  maxLength: max,
});
const optional = (schema: object) => ({ ...schema, nullable: true });
const object = (properties: Record<string, object>, required = Object.keys(properties)) => ({
  type: 'object',
  additionalProperties: false,
  required,
  properties,
});

const TARGETS = {
  setting: object({ kind: { const: 'setting' }, key: { enum: Object.keys(SETTINGS) } }),
  profile: object({ kind: { const: 'profile' }, handle: { type: 'string', pattern: HANDLE } }),
  project: object({ kind: { const: 'project' }, slug: { type: 'string', pattern: SLUG } }),
};

const PATCHES = {
  setting: object({ target: TARGETS.setting, value: {} }),
  profile: {
    ...object(
      {
        target: TARGETS.profile,
        fields: {
          ...object(
            {
              name: optional({ type: 'string' }),
              alias: optional({ type: 'string' }),
              headline: optional({ type: 'string' }),
              bio: optional({ type: 'string' }),
              accent: optional({ type: 'string' }),
              avatarUpload: optional({ type: 'string' }),
              coverUpload: optional({ type: 'string' }),
              listed: { type: 'boolean' },
            } satisfies Record<(typeof PROFILE_FIELDS)[number], object>,
            [],
          ),
          minProperties: 1,
        },
        blocks: {
          type: 'array',
          maxItems: LIMITS.blocks,
          items: {
            type: 'object',
            required: ['id', 'type'],
            properties: { id: { type: 'string' }, type: { enum: BLOCK_TYPES } },
          },
        },
      },
      ['target'],
    ),
    anyOf: [{ required: ['fields'] }, { required: ['blocks'] }],
  },
  project: object({
    target: TARGETS.project,
    fields: {
      ...object(
        {
          name: between(PROJECT_LIMITS.name),
          summary: between(PROJECT_LIMITS.summary),
          tags: {
            type: 'array',
            maxItems: PROJECT_LIMITS.tags,
            uniqueItems: true,
            items: { type: 'string', pattern: '^[a-z0-9][a-z0-9+.-]*$', maxLength: 30 },
          },
          status: { enum: STATUSES },
          listed: { type: 'boolean' },
          pinOrder: optional({ type: 'integer', minimum: 0, maximum: 999 }),
          showcase: optional(
            object({
              problem: between(PROJECT_LIMITS.problem),
              approach: between(PROJECT_LIMITS.approach),
              outcome: between(PROJECT_LIMITS.outcome),
              contributions: {
                type: 'array',
                minItems: 1,
                uniqueItems: true,
                items: object({
                  github: { type: 'string', pattern: LOGIN },
                  summary: between(PROJECT_LIMITS.contribution),
                }),
              },
            }),
          ),
          owner: { type: 'string', pattern: HANDLE },
          authors: {
            type: 'array',
            minItems: 1,
            uniqueItems: true,
            items: { type: 'string', pattern: LOGIN },
          },
          coverUpload: optional({ type: 'string', pattern: UPLOAD }),
          accent: optional({ type: 'string', pattern: HEX }),
          layout: { enum: ['window', 'card'] },
          feature: object({
            note: { type: 'string', maxLength: PROJECT_LIMITS.note },
            screenshot: optional({ type: 'string', pattern: UPLOAD }),
            posts: {
              type: 'array',
              maxItems: PROJECT_LIMITS.posts,
              uniqueItems: true,
              items: { type: 'string', maxLength: 40 },
            },
          }),
        } satisfies Record<keyof ProjectFields, object>,
        [],
      ),
      minProperties: 1,
    },
  }),
};

const PROJECT_REASONS: Partial<Record<string, string>> = {
  name: `A name is ${PROJECT_LIMITS.name.min} to ${PROJECT_LIMITS.name.max} characters.`,
  summary: `A summary is ${PROJECT_LIMITS.summary.min} to ${PROJECT_LIMITS.summary.max} characters.`,
  tags: `Up to ${PROJECT_LIMITS.tags} different lowercase tags.`,
  status: `A status is one of ${STATUSES.join(', ')}.`,
  listed: 'Listed is on or off.',
  pinOrder: 'The featured order is a whole number, or nothing.',
  showcase: 'A showcase has a problem, an approach, an outcome and at least one contribution.',
  owner: 'An owner is a member’s handle.',
  authors: 'Authors are GitHub logins, at least one.',
  coverUpload: 'That image is not an upload.',
  accent: 'An accent is a colour like #6f8fd1.',
  layout: 'The layout is a window or a card.',
  feature: `The feature slot has a note of up to ${PROJECT_LIMITS.note} characters, a screenshot and up to ${PROJECT_LIMITS.posts} posts.`,
};

const VERSION_KIND = { setting: 'settings', profile: 'profile', project: 'project' } as const;

type Kind = EditTarget['kind'];

function reason(kind: Kind, [first]: ErrorObject[]) {
  if (first.keyword === 'additionalProperties') {
    return `${first.params.additionalProperty as string} cannot be edited.`;
  }
  return (
    (kind === 'project' ? PROJECT_REASONS[first.instancePath.split('/')[2]] : undefined) ??
    `That edit is not valid: ${first.instancePath} ${first.message}.`
  );
}

function keyOf(target: EditTarget) {
  return target.kind === 'setting'
    ? target.key
    : target.kind === 'profile'
      ? target.handle
      : target.slug;
}

function trimmed(patch: unknown) {
  const fields = (patch as { fields?: Record<string, unknown> } | null)?.fields;
  if ((patch as EditPatch | null)?.target?.kind !== 'project' || typeof fields !== 'object') {
    return patch;
  }
  return {
    ...(patch as object),
    fields: Object.fromEntries(
      Object.entries(fields ?? {}).map(([key, value]) => [
        key,
        (key === 'name' || key === 'summary') && typeof value === 'string' ? value.trim() : value,
      ]),
    ),
  };
}

export function createEdit(
  db: Database,
  services: { settings: Settings; profiles: Profiles; projects: Projects; uploads: Uploads },
) {
  const { settings, profiles, projects, uploads } = services;
  const ajv = new Ajv2020({ allErrors: false });
  const isTarget = ajv.compile<EditTarget>({ oneOf: Object.values(TARGETS) });
  const patches = Object.fromEntries(
    Object.entries(PATCHES).map(([kind, schema]) => [kind, ajv.compile(schema)]),
  ) as Record<Kind, ValidateFunction<EditPatch>>;

  function mayEdit(viewer: Viewer | null, target: EditTarget, fields: string[] = []) {
    if (!viewer) {
      return false;
    }
    const handle = viewer.login.toLowerCase();
    switch (target.kind) {
      case 'setting':
        return viewer.owner && isSettingKey(target.key);
      case 'profile':
        return (
          (viewer.owner || target.handle === handle) &&
          Boolean(
            db
              .prepare('SELECT 1 FROM members WHERE handle = ? AND left_at IS NULL')
              .get(target.handle),
          )
        );
      case 'project': {
        const project = projects.read(target.slug);
        return (
          project !== undefined &&
          (viewer.owner ||
            (project.owner === handle &&
              !fields.some((field) => (OWNER_ONLY_FIELDS as readonly string[]).includes(field))))
        );
      }
    }
  }

  function latest(target: EditTarget) {
    return db
      .prepare('SELECT max(id) AS id FROM versions WHERE kind = ? AND key = ?')
      .get(VERSION_KIND[target.kind], keyOf(target))!.id as number | null;
  }

  function current(target: EditTarget) {
    switch (target.kind) {
      case 'setting':
        return settings.get()[target.key];
      case 'profile':
        return profiles.read(target.handle);
      case 'project':
        return projectFields(projects.read(target.slug)!);
    }
  }

  async function commit(patch: EditPatch, by: string) {
    switch (patch.target.kind) {
      case 'setting':
        return settings.set(patch.target.key, (patch as { value: unknown }).value, by);
      case 'profile':
        return profiles.save(patch.target.handle, patch as Parameters<Profiles['save']>[1], by);
      case 'project':
        return projects.save(
          patch.target.slug,
          (patch as { fields: Partial<ProjectFields> }).fields,
          by,
        );
    }
  }

  async function apply(input: unknown, viewer: Viewer | null): Promise<EditResult | null> {
    const patch = trimmed(input) as EditPatch | null;
    const target = patch?.target;
    if (!viewer || !isTarget(target) || !mayEdit(viewer, target)) {
      return null;
    }
    const valid = patches[target.kind];
    if (!valid(patch)) {
      return { ok: false, error: reason(target.kind, valid.errors!) };
    }
    if (!mayEdit(viewer, target, Object.keys((patch as { fields?: object }).fields ?? {}))) {
      return null;
    }
    if (latest(target) === null) {
      db.prepare('INSERT INTO versions (kind, key, blob, by, at) VALUES (?, ?, ?, ?, ?)').run(
        VERSION_KIND[target.kind],
        keyOf(target),
        JSON.stringify(current(target)),
        'hub',
        new Date().toISOString(),
      );
    }
    try {
      await commit(patch, viewer.login);
    } catch (error) {
      if (isRefused(error) || error instanceof SettingRefused) {
        return { ok: false, error: error.message };
      }
      throw error;
    }
    return { ok: true, version: latest(target)! };
  }

  return {
    mayEdit,
    apply,

    async upload(
      target: unknown,
      kind: UploadKind,
      file: Blob,
      viewer: Viewer | null,
    ): Promise<{ upload: string } | { ok: false; error: string } | null> {
      if (!viewer || !isTarget(target) || target.kind === 'setting' || !mayEdit(viewer, target)) {
        return null;
      }
      if (!(TARGET_UPLOADS[target.kind] as readonly string[]).includes(kind)) {
        return { ok: false, error: `A ${target.kind} takes no ${kind} image.` };
      }
      try {
        return {
          upload: await uploads.store(
            target.kind === 'profile' ? target.handle : viewer.login.toLowerCase(),
            kind,
            file,
          ),
        };
      } catch (error) {
        if (isRefused(error)) {
          return { ok: false, error: error.message };
        }
        throw error;
      }
    },

    history(targets: unknown, viewer: Viewer | null): EditVersion[] | null {
      if (
        !viewer ||
        !Array.isArray(targets) ||
        targets.length > 60 ||
        !targets.every(
          (target): target is EditTarget => isTarget(target) && mayEdit(viewer, target),
        )
      ) {
        return null;
      }
      const versions = db.prepare(
        'SELECT id, by, at FROM versions WHERE kind = ? AND key = ? ORDER BY id DESC LIMIT ?',
      );
      return targets
        .flatMap((target) =>
          versions.all(VERSION_KIND[target.kind], keyOf(target), HISTORY).map((row) => ({
            id: row.id as number,
            target,
            by: row.by as string,
            at: row.at as string,
          })),
        )
        .sort((a, b) => b.id - a.id)
        .slice(0, HISTORY);
    },

    async restore(version: number, viewer: Viewer | null) {
      const row = Number.isInteger(version)
        ? db.prepare('SELECT kind, key, blob FROM versions WHERE id = ?').get(version)
        : undefined;
      const key = row?.key as string;
      switch (row?.kind) {
        case 'settings':
          return apply({ target: { kind: 'setting', key }, value: json(row.blob) }, viewer);
        case 'profile': {
          const profile = json<Profile>(row.blob);
          return apply(
            {
              target: { kind: 'profile', handle: key },
              fields: profileFields(profile),
              blocks: profile.blocks,
            },
            viewer,
          );
        }
        case 'project': {
          const fields = json<ProjectFields>(row.blob);
          return apply(
            {
              target: { kind: 'project', slug: key },
              fields: viewer?.owner
                ? fields
                : Object.fromEntries(
                    Object.entries(fields).filter(
                      ([field]) => !(OWNER_ONLY_FIELDS as readonly string[]).includes(field),
                    ),
                  ),
            },
            viewer,
          );
        }
        default:
          return null;
      }
    },
  };
}

export type Edit = ReturnType<typeof createEdit>;
