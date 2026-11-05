import type { MemberLink, StackGroup } from './types';

export const BLOCK_TYPES = [
  'bio',
  'projects',
  'stack',
  'github',
  'timeline',
  'links',
  'short-links',
  'writing',
  'gallery',
  'text',
  'quote',
  'embed',
] as const;

export type BlockType = (typeof BLOCK_TYPES)[number];

export const BLOCK_LABEL: Record<BlockType, string> = {
  bio: 'bio',
  projects: 'projects',
  stack: 'stack',
  github: 'on github',
  timeline: 'releases',
  links: 'links',
  'short-links': 'short links',
  writing: 'writing',
  gallery: 'gallery',
  text: 'text',
  quote: 'quote',
  embed: 'embed',
};

export interface GalleryImage {
  upload: string;
  caption: string;
}

export type Block =
  | { id: string; type: 'bio' | 'github' | 'timeline' | 'short-links' | 'writing' }
  | { id: string; type: 'stack'; groups: StackGroup[] }
  | { id: string; type: 'links'; links: MemberLink[] }
  | { id: string; type: 'projects'; slugs: string[] | null; layout: 'windows' | 'rows' }
  | { id: string; type: 'gallery'; images: GalleryImage[] }
  | { id: string; type: 'text'; title: string; body: string }
  | { id: string; type: 'quote'; text: string; source: string }
  | { id: string; type: 'embed'; url: string; title: string };

export const UPLOAD_WIDTHS = {
  avatar: [256, 96],
  cover: [1600, 800],
  gallery: [1600, 800],
  screenshot: [1600, 800],
} as const;

export type UploadKind = keyof typeof UPLOAD_WIDTHS;

export const UPLOAD_LIMIT = 5 * 1024 * 1024;

export class Refused extends Error {}

export function isUploadKind(kind: unknown): kind is UploadKind {
  return typeof kind === 'string' && Object.hasOwn(UPLOAD_WIDTHS, kind);
}

export function uploadUrl(id: string, kind: UploadKind, size: 'large' | 'small' = 'large') {
  return `/uploads/${id}/${UPLOAD_WIDTHS[kind][size === 'large' ? 0 : 1]}.webp`;
}

export interface ShortLink {
  name: string;
  url: string;
  listed: boolean;
}

export interface ProfileFields {
  alias: string | null;
  headline: string | null;
  bio: string | null;
  accent: string | null;
  avatarUpload: string | null;
  coverUpload: string | null;
  listed: boolean;
}

export interface Profile extends ProfileFields {
  handle: string;
  blocks: Block[];
  edited: boolean;
}

export const LIMITS = {
  blocks: 20,
  headline: 90,
  bio: 1200,
  links: 12,
  stackGroups: 10,
  stackItems: 16,
  gallery: 12,
  text: 2000,
  title: 80,
  quote: 400,
  shortLinks: 30,
};

export const EMBED_HOSTS = [
  'youtube.com',
  'www.youtube.com',
  'youtu.be',
  'vimeo.com',
  'player.vimeo.com',
  'codepen.io',
  'www.figma.com',
  'www.loom.com',
];

export const RESERVED = new Set([
  'admin',
  'api',
  'assets',
  'auth',
  'blog',
  'changelog',
  'edit',
  'epics',
  'feed',
  'go',
  'health',
  'internal',
  'kit',
  'live',
  'llms.txt',
  'members',
  'messages',
  'new',
  'privacy',
  'projects',
  'search',
  'settings',
  'share',
  'sign-in',
  'sitemap.xml',
  'status',
  'uploads',
]);

const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/;
const HEX = /^#[0-9a-f]{6}$/i;

export function httpsUrl(value: unknown) {
  if (typeof value !== 'string' || value.length > 500) {
    return false;
  }
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || (url.protocol === 'mailto:' && value.includes('@'));
  } catch {
    return false;
  }
}

export function aliasProblem(alias: string, taken: { slugs: Set<string>; aliases: Set<string> }) {
  if (!SLUG.test(alias)) {
    return 'An alias is 1 to 32 lowercase letters, digits or dashes, not starting or ending with a dash.';
  }
  if (RESERVED.has(alias)) {
    return `/${alias} is a page of the site.`;
  }
  if (taken.slugs.has(alias)) {
    return `/${alias} is a project, and projects come first.`;
  }
  if (taken.aliases.has(alias)) {
    return `/${alias} is another member's alias.`;
  }
  return null;
}

function text(value: unknown, max: number, required = true) {
  return typeof value === 'string' && value.length <= max && (!required || value.trim() !== '');
}

export function blockProblem(block: Block, uploads: Set<string>): string | null {
  switch (block.type) {
    case 'bio':
    case 'github':
    case 'timeline':
    case 'short-links':
    case 'writing':
      return null;
    case 'stack':
      return Array.isArray(block.groups) &&
        block.groups.length <= LIMITS.stackGroups &&
        block.groups.every(
          (group) =>
            text(group.group, 30) &&
            Array.isArray(group.items) &&
            group.items.length <= LIMITS.stackItems &&
            group.items.every((item) => text(item, 40)),
        )
        ? null
        : `Stack: up to ${LIMITS.stackGroups} groups of up to ${LIMITS.stackItems} named items.`;
    case 'links':
      return Array.isArray(block.links) &&
        block.links.length <= LIMITS.links &&
        block.links.every((link) => text(link.label, 30) && httpsUrl(link.url))
        ? null
        : `Links: up to ${LIMITS.links}, each with a label and an https or mailto address.`;
    case 'projects':
      return ['windows', 'rows'].includes(block.layout) &&
        (block.slugs === null ||
          (Array.isArray(block.slugs) && block.slugs.every((slug) => SLUG.test(slug))))
        ? null
        : 'Projects: a layout of windows or rows and a list of project slugs.';
    case 'gallery':
      return Array.isArray(block.images) &&
        block.images.length <= LIMITS.gallery &&
        block.images.every((image) => uploads.has(image.upload) && text(image.caption, 140, false))
        ? null
        : `Gallery: up to ${LIMITS.gallery} uploaded images with short captions.`;
    case 'text':
      return text(block.title, LIMITS.title, false) && text(block.body, LIMITS.text)
        ? null
        : `Text: a title up to ${LIMITS.title} characters and a body up to ${LIMITS.text}.`;
    case 'quote':
      return text(block.text, LIMITS.quote) && text(block.source, 80, false)
        ? null
        : `Quote: up to ${LIMITS.quote} characters and an optional source.`;
    case 'embed': {
      const host = httpsUrl(block.url) ? new URL(block.url).hostname : '';
      return EMBED_HOSTS.includes(host) && text(block.title, LIMITS.title)
        ? null
        : `Embed: a titled https link from ${EMBED_HOSTS.join(', ')}.`;
    }
    default:
      return 'Unknown block.';
  }
}

export function blocksProblem(blocks: unknown, uploads: Set<string>) {
  if (!Array.isArray(blocks) || blocks.length > LIMITS.blocks) {
    return `A page has at most ${LIMITS.blocks} blocks.`;
  }
  const ids = new Set<string>();
  for (const block of blocks as Block[]) {
    if (typeof block?.id !== 'string' || ids.has(block.id) || !BLOCK_TYPES.includes(block.type)) {
      return 'Every block needs a known type and its own id.';
    }
    ids.add(block.id);
    const problem = blockProblem(block, uploads);
    if (problem) {
      return problem;
    }
  }
  return null;
}

export function fieldsProblem(fields: Partial<ProfileFields>, uploads: Set<string>) {
  if (fields.headline != null && !text(fields.headline, LIMITS.headline, false)) {
    return `A headline is at most ${LIMITS.headline} characters.`;
  }
  if (fields.bio != null && !text(fields.bio, LIMITS.bio, false)) {
    return `A bio is at most ${LIMITS.bio} characters.`;
  }
  if (fields.accent != null && !HEX.test(fields.accent)) {
    return 'An accent is a colour like #6f8fd1.';
  }
  for (const upload of [fields.avatarUpload, fields.coverUpload]) {
    if (upload != null && !uploads.has(upload)) {
      return 'That image is not one of your uploads.';
    }
  }
  return null;
}

export function shortLinkProblem(link: ShortLink) {
  if (!SLUG.test(link.name)) {
    return 'A short link name is lowercase letters, digits or dashes.';
  }
  return httpsUrl(link.url) ? null : 'A short link points at an https address.';
}

export function defaultBlocks(existing: Block[]): Block[] {
  const found = (type: BlockType) => existing.find((block) => block.type === type);
  return [
    { id: 'bio', type: 'bio' },
    { id: 'projects', type: 'projects', slugs: null, layout: 'windows' },
    found('stack') ?? { id: 'stack', type: 'stack', groups: [] },
    { id: 'github', type: 'github' },
    { id: 'timeline', type: 'timeline' },
    found('links') ?? { id: 'links', type: 'links', links: [] },
    { id: 'short-links', type: 'short-links' },
  ];
}

export function newBlock(type: BlockType, id: string): Block {
  switch (type) {
    case 'stack':
      return { id, type, groups: [] };
    case 'links':
      return { id, type, links: [] };
    case 'projects':
      return { id, type, slugs: null, layout: 'windows' };
    case 'gallery':
      return { id, type, images: [] };
    case 'text':
      return { id, type, title: '', body: 'Write something.' };
    case 'quote':
      return { id, type, text: 'A line worth keeping.', source: '' };
    case 'embed':
      return { id, type, url: 'https://www.youtube.com/', title: 'A video' };
    default:
      return { id, type };
  }
}

export function embedSource(url: string) {
  const parsed = new URL(url);
  const host = parsed.hostname;
  if (host === 'youtu.be') {
    return `https://www.youtube-nocookie.com/embed/${parsed.pathname.slice(1)}`;
  }
  if (host.endsWith('youtube.com')) {
    const id = parsed.searchParams.get('v') ?? parsed.pathname.split('/').pop();
    return `https://www.youtube-nocookie.com/embed/${id}`;
  }
  if (host === 'vimeo.com') {
    return `https://player.vimeo.com/video${parsed.pathname}`;
  }
  if (host === 'codepen.io') {
    return url.replace('/pen/', '/embed/');
  }
  if (host === 'www.figma.com') {
    return `https://www.figma.com/embed?embed_host=share&url=${encodeURIComponent(url)}`;
  }
  if (host === 'www.loom.com') {
    return url.replace('/share/', '/embed/');
  }
  return url;
}
