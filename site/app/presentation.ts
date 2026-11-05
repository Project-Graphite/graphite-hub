import type { ProjectStatus } from './types';

export interface Feature {
  note: string;
  screenshot: string | null;
}

export interface Presentation {
  coverUpload: string | null;
  accent: string | null;
  summary: string | null;
  layout: 'window' | 'card';
  feature: Feature;
}

export const NO_PRESENTATION: Presentation = {
  coverUpload: null,
  accent: null,
  summary: null,
  layout: 'window',
  feature: { note: '', screenshot: null },
};

export interface RegistryFields {
  name: string;
  summary: string;
  tags: string[];
  status: ProjectStatus;
  pinned: boolean;
  listed: boolean;
}

export const REGISTRY_FIELDS = ['name', 'summary', 'tags', 'status', 'pinned', 'listed'] as const;
export const STATUSES: ProjectStatus[] = ['live', 'wip', 'archived', 'source-only'];

const TAG = /^[a-z0-9][a-z0-9+.-]*$/;
const HEX = /^#[0-9a-f]{6}$/i;

export function presentationProblem(value: Presentation, uploads: (id: string) => boolean) {
  if (value.accent !== null && !HEX.test(value.accent)) {
    return 'An accent is a colour like #6f8fd1.';
  }
  if (value.summary !== null && (value.summary.length < 20 || value.summary.length > 240)) {
    return 'A summary is 20 to 240 characters.';
  }
  if (!['window', 'card'].includes(value.layout)) {
    return 'The layout is a window or a card.';
  }
  if (typeof value.feature?.note !== 'string' || value.feature.note.length > 600) {
    return 'The feature note is at most 600 characters.';
  }
  for (const upload of [value.coverUpload, value.feature.screenshot]) {
    if (upload !== null && !uploads(upload)) {
      return 'That image is not an upload.';
    }
  }
  return null;
}

export function registryProblem(fields: Partial<RegistryFields>) {
  if (fields.name !== undefined && (fields.name.length < 2 || fields.name.length > 60)) {
    return 'A name is 2 to 60 characters.';
  }
  if (
    fields.summary !== undefined &&
    (fields.summary.trim().length < 20 || fields.summary.length > 240)
  ) {
    return 'A summary is 20 to 240 characters.';
  }
  if (
    fields.tags !== undefined &&
    (fields.tags.length > 6 ||
      new Set(fields.tags).size !== fields.tags.length ||
      !fields.tags.every((tag) => TAG.test(tag)))
  ) {
    return 'Up to six different lowercase tags.';
  }
  if (fields.status !== undefined && !STATUSES.includes(fields.status)) {
    return `A status is one of ${STATUSES.join(', ')}.`;
  }
  for (const key of ['pinned', 'listed'] as const) {
    if (fields[key] !== undefined && typeof fields[key] !== 'boolean') {
      return `${key} is on or off.`;
    }
  }
  return null;
}
