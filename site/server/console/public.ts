import type { HubEvent } from '../bus.ts';

export interface PublicEvent {
  kind: string;
  at: string;
  summary: string;
  detail: Record<string, string | number | boolean | Record<string, number> | string[]>;
}

type Detail = Record<string, unknown>;

const number = (value: unknown) => (typeof value === 'number' ? value : undefined);
const text = (value: unknown) => (typeof value === 'string' ? value : undefined);
const counts = (value: unknown) =>
  Object.fromEntries(
    Object.entries((value ?? {}) as Detail).filter(
      (entry): entry is [string, number] => typeof entry[1] === 'number',
    ),
  );
const slugs = (value: unknown) =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : undefined;

function defined(detail: PublicEvent['detail'] | Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(detail).filter(([, value]) => value !== undefined),
  ) as PublicEvent['detail'];
}

const projections: Record<string, (detail: Detail) => PublicEvent['detail']> = {
  deploy: (detail) =>
    defined({
      project: text(detail.project),
      tag: text(detail.tag)?.replace(/^sha-/, '').slice(0, 7),
      ok: detail.ok === true,
      durationMs: number(detail.durationMs),
      healthStatus: number(detail.healthStatus),
      healthMs: number(detail.healthMs),
    }),
  release: (detail) =>
    defined({
      project: text(detail.project),
      version: text(detail.version),
      counts: counts(detail.counts),
    }),
  sync: (detail) =>
    defined({
      added: slugs(detail.added),
      changed: slugs(detail.changed),
      removed: slugs(detail.removed),
      projects: number(detail.projects),
      stars: detail.stars === undefined ? undefined : counts(detail.stars),
    }),
  uptime: (detail) =>
    defined({ up: number(detail.up), total: number(detail.total), p95Ms: number(detail.p95Ms) }),
  post: (detail) =>
    defined({
      author: text(detail.author),
      title: text(detail.title),
      project: text(detail.project),
      slug: text(detail.slug),
    }),
};

export function toPublicEvent(event: HubEvent): PublicEvent | null {
  const project = projections[event.kind];
  if (!event.public || !project) {
    return null;
  }
  return { kind: event.kind, at: event.at, summary: event.summary, detail: project(event.detail) };
}
