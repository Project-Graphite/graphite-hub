import { mergeAttributes, Node, type Extensions } from '@tiptap/core';
import { Details, DetailsContent, DetailsSummary } from '@tiptap/extension-details';
import Highlight from '@tiptap/extension-highlight';
import Image from '@tiptap/extension-image';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { TableKit } from '@tiptap/extension-table';
import TextAlign from '@tiptap/extension-text-align';
import { Color, TextStyle } from '@tiptap/extension-text-style';
import UniqueID from '@tiptap/extension-unique-id';
import Youtube from '@tiptap/extension-youtube';
import StarterKit from '@tiptap/starter-kit';

export const CALLOUT_TINTS = ['plain', 'info', 'success', 'warning', 'danger'] as const;

export const Callout = Node.create({
  name: 'callout',
  group: 'block',
  content: 'paragraph+',
  defining: true,
  addAttributes: () => ({
    tint: {
      default: 'plain',
      parseHTML: (element: HTMLElement) =>
        CALLOUT_TINTS.find((tint) => tint === element.getAttribute('data-tint')) ?? 'plain',
      renderHTML: (attributes: { tint?: string }) => ({ 'data-tint': attributes.tint }),
    },
  }),
  parseHTML: () => [{ tag: 'aside[data-callout]' }],
  renderHTML: ({ HTMLAttributes }) => [
    'aside',
    mergeAttributes(HTMLAttributes, { 'data-callout': '', class: 'callout' }),
    0,
  ],
});

export const Column = Node.create({
  name: 'column',
  content: 'block+',
  isolating: true,
  parseHTML: () => [{ tag: 'div[data-column]' }],
  renderHTML: ({ HTMLAttributes }) => [
    'div',
    mergeAttributes(HTMLAttributes, { 'data-column': '', class: 'column' }),
    0,
  ],
});

export const Columns = Node.create({
  name: 'columns',
  group: 'block',
  content: 'column{2,3}',
  isolating: true,
  parseHTML: () => [{ tag: 'div[data-columns]' }],
  renderHTML: ({ HTMLAttributes }) => [
    'div',
    mergeAttributes(HTMLAttributes, { 'data-columns': '', class: 'columns' }),
    0,
  ],
});

export const columnsOf = (count: number) => ({
  type: 'columns',
  content: Array.from({ length: count }, () => ({
    type: 'column',
    content: [{ type: 'paragraph' }],
  })),
});

export const BLOCK_TYPES = [
  'paragraph',
  'heading',
  'blockquote',
  'codeBlock',
  'callout',
  'details',
  'table',
  'bulletList',
  'orderedList',
  'taskList',
  'image',
  'horizontalRule',
  'columns',
  'youtube',
];

export function postExtensions(collaborative = false): Extensions {
  return [
    StarterKit.configure({
      undoRedo: collaborative ? false : undefined,
      link: { openOnClick: false, autolink: true },
      heading: { levels: [2, 3, 4] },
    }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Highlight.configure({ multicolor: true }),
    TextStyle,
    Color,
    Callout,
    Columns,
    Column,
    Details.configure({ persist: true, HTMLAttributes: { class: 'toggle' } }),
    DetailsSummary,
    DetailsContent,
    TableKit.configure({ table: { resizable: false, cellMinWidth: 96 } }),
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    Image.configure({ allowBase64: false, HTMLAttributes: { loading: 'lazy' } }),
    Youtube.configure({
      addPasteHandler: false,
      nocookie: true,
      rel: 0,
      HTMLAttributes: {
        loading: 'lazy',
        referrerpolicy: 'strict-origin-when-cross-origin',
        sandbox: 'allow-scripts allow-same-origin allow-presentation allow-popups',
      },
    }),
    UniqueID.configure({ types: BLOCK_TYPES }),
  ];
}
