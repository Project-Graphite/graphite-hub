import type { Feature } from '../presentation';
import type { Block, ProfileFields } from '../profile';
import type { SettingKey } from '../settings';
import type { ProjectShowcase, ProjectStatus } from '../types';

export type EditTarget =
  | { kind: 'setting'; key: SettingKey }
  | { kind: 'profile'; handle: string }
  | { kind: 'project'; slug: string };

export type EditPatch =
  | { target: { kind: 'setting'; key: SettingKey }; value: unknown }
  | {
      target: { kind: 'profile'; handle: string };
      fields?: Partial<ProfileFields>;
      blocks?: Block[];
    }
  | { target: { kind: 'project'; slug: string }; fields: Partial<ProjectFields> };

export interface ProjectFields {
  name: string;
  summary: string;
  tags: string[];
  status: ProjectStatus;
  listed: boolean;
  pinOrder: number | null;
  showcase: ProjectShowcase | null;
  owner: string;
  authors: string[];
  coverUpload: string | null;
  accent: string | null;
  layout: 'window' | 'card';
  feature: Feature;
}

export type EditResult = { ok: true; version: number } | { ok: false; error: string };

export interface EditVersion {
  id: number;
  target: EditTarget;
  by: string;
  at: string;
}

export const OWNER_ONLY_FIELDS = ['owner', 'authors', 'pinOrder'] as const;

export const TARGET_UPLOADS = {
  profile: ['avatar', 'cover', 'gallery'],
  project: ['cover', 'screenshot'],
} as const;
