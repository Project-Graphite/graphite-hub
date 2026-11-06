import { getSchema } from '@tiptap/core';
import { generateHTML } from '@tiptap/html';
import {
  prosemirrorJSONToYDoc,
  prosemirrorJSONToYXmlFragment,
  yDocToProsemirrorJSON,
} from '@tiptap/y-tiptap';
import * as Y from 'yjs';
import { postExtensions } from '../app/editor/extensions.ts';
import { readingMinutes, slugify } from '../app/posts.ts';

export const FRAGMENT = 'default';

interface JsonNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: JsonNode[];
  marks?: { type: string; attrs?: Record<string, unknown> }[];
  text?: string;
}

export interface Heading {
  id: string;
  level: number;
  text: string;
}

export interface Rendered {
  html: string;
  text: string;
  words: number;
  readingMinutes: number;
  headings: Heading[];
}

const extensions = postExtensions();
export const schema = getSchema(extensions);

const YOUTUBE = /^https:\/\/(www\.)?(youtube\.com|youtu\.be|youtube-nocookie\.com)\//;

function safeLink(href: unknown) {
  return typeof href === 'string' && /^(https?:\/\/|mailto:)/i.test(href);
}

function plain(node: JsonNode): string {
  return node.text ?? node.content?.map(plain).join(node.type === 'paragraph' ? '' : ' ') ?? '';
}

function clean(node: JsonNode): JsonNode | null {
  if (node.type === 'image' && !String(node.attrs?.src ?? '').startsWith('/uploads/')) {
    return null;
  }
  if (node.type === 'youtube' && !YOUTUBE.test(String(node.attrs?.src ?? ''))) {
    return null;
  }
  return {
    ...node,
    marks: node.marks?.filter((mark) => mark.type !== 'link' || safeLink(mark.attrs?.href)),
    content: node.content?.flatMap((child) => clean(child) ?? []),
  };
}

export function stateToJson(state: Uint8Array | null): JsonNode {
  if (!state) {
    return { type: 'doc', content: [{ type: 'paragraph' }] };
  }
  const doc = new Y.Doc();
  Y.applyUpdate(doc, state);
  try {
    const json = yDocToProsemirrorJSON(doc, FRAGMENT) as JsonNode;
    return json.content?.length ? json : { type: 'doc', content: [{ type: 'paragraph' }] };
  } finally {
    doc.destroy();
  }
}

export function jsonToState(json: object) {
  const doc = prosemirrorJSONToYDoc(schema, json, FRAGMENT);
  try {
    return Y.encodeStateAsUpdate(doc);
  } finally {
    doc.destroy();
  }
}

export function fillFragment(fragment: Y.XmlFragment, json: object) {
  fragment.delete(0, fragment.length);
  prosemirrorJSONToYXmlFragment(schema, json, fragment);
}

export function renderJson(raw: JsonNode): Rendered {
  const json = clean(raw)!;
  const headings: Heading[] = [];
  const seen = new Map<string, number>();
  for (const node of json.content ?? []) {
    if (node.type === 'heading') {
      const text = plain(node).trim();
      const base = slugify(text) || 'section';
      const count = seen.get(base) ?? 0;
      seen.set(base, count + 1);
      headings.push({
        id: count ? `${base}-${count + 1}` : base,
        level: Number(node.attrs?.level ?? 2),
        text,
      });
    }
  }
  let index = 0;
  const html = generateHTML(json, extensions).replace(/<h([2-4])(\s|>)/g, (_match, level, rest) => {
    const heading = headings[index++];
    return `<h${level} id="${heading?.id ?? ''}"${rest === '>' ? '>' : ' '}`;
  });
  const text = plain(json).replace(/\s+/g, ' ').trim();
  return {
    html,
    text,
    words: text.split(/\s+/).filter(Boolean).length,
    readingMinutes: readingMinutes(text),
    headings,
  };
}

export function render(state: Uint8Array | null) {
  return renderJson(stateToJson(state));
}
