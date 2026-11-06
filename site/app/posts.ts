export type PostStatus = 'draft' | 'scheduled' | 'published' | 'trashed';

export interface PostFields {
  title: string;
  slug: string;
  summary: string;
  tags: string[];
  project: string | null;
  coverUpload: string | null;
  editors: string[];
}

export interface Post extends PostFields {
  id: string;
  author: string;
  status: PostStatus;
  publishAt: string | null;
  publishedAt: string | null;
  readingMinutes: number | null;
  beforeTrash: PostStatus | null;
  trashedAt: string | null;
  createdAt: string;
  updatedAt: string;
  updatedBy: string;
}

export interface PostSummary {
  id: string;
  slug: string;
  title: string;
  summary: string;
  author: string;
  project: string | null;
  tags: string[];
  coverUrl: string | null;
  publishedAt: string;
  readingMinutes: number;
  path: string;
}

export interface PostVersion {
  id: number;
  by: string;
  at: string;
  title: string;
  label: string | null;
}

export interface PostTemplate {
  id: string;
  name: string;
  by: string | null;
}

export const POST_LIMITS = { title: 120, slug: 80, summary: 280, tags: 6, editors: 10 };
export const WORDS_PER_MINUTE = 220;

const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/;
const TAG = /^[a-z0-9][a-z0-9+.-]{0,29}$/;

export function slugify(text: string) {
  return text
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, POST_LIMITS.slug)
    .replace(/-+$/, '');
}

export function readingMinutes(text: string) {
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / WORDS_PER_MINUTE));
}

export function postPath(authorPath: string, slug: string) {
  return `${authorPath}/blog/${slug}`;
}

export function isPostStatus(value: unknown): value is PostStatus {
  return ['draft', 'scheduled', 'published', 'trashed'].includes(value as string);
}

export function postProblem(
  fields: PostFields,
  known: {
    upload: (id: string) => boolean;
    member: (handle: string) => boolean;
    project: (slug: string) => boolean;
  },
) {
  if (typeof fields.title !== 'string' || fields.title.length > POST_LIMITS.title) {
    return `A title is at most ${POST_LIMITS.title} characters.`;
  }
  if (typeof fields.slug !== 'string' || !SLUG.test(fields.slug)) {
    return 'A slug is lowercase letters, digits and dashes, up to 80 characters.';
  }
  if (typeof fields.summary !== 'string' || fields.summary.length > POST_LIMITS.summary) {
    return `A summary is at most ${POST_LIMITS.summary} characters.`;
  }
  if (
    !Array.isArray(fields.tags) ||
    fields.tags.length > POST_LIMITS.tags ||
    new Set(fields.tags).size !== fields.tags.length ||
    !fields.tags.every((tag) => typeof tag === 'string' && TAG.test(tag))
  ) {
    return `Up to ${POST_LIMITS.tags} different lowercase tags.`;
  }
  if (
    fields.project !== null &&
    (typeof fields.project !== 'string' || !known.project(fields.project))
  ) {
    return 'That project is not in the registry.';
  }
  if (
    fields.coverUpload !== null &&
    (typeof fields.coverUpload !== 'string' || !known.upload(fields.coverUpload))
  ) {
    return 'That cover is not one of your uploads.';
  }
  if (
    !Array.isArray(fields.editors) ||
    fields.editors.length > POST_LIMITS.editors ||
    new Set(fields.editors).size !== fields.editors.length ||
    !fields.editors.every((handle) => typeof handle === 'string' && known.member(handle))
  ) {
    return `Up to ${POST_LIMITS.editors} members may co-edit a post.`;
  }
  return null;
}

export function publishable(fields: PostFields) {
  if (fields.title.trim() === '') {
    return 'Give the post a title before publishing.';
  }
  return null;
}

export const STATUS_LABEL: Record<PostStatus, string> = {
  draft: 'draft',
  scheduled: 'scheduled',
  published: 'published',
  trashed: 'in the trash',
};
