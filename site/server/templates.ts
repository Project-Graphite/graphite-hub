type Inline = string | { text: string; marks?: string[] };

const paragraph = (...parts: Inline[]) => ({
  type: 'paragraph',
  content: parts
    .filter((part) => (typeof part === 'string' ? part : part.text) !== '')
    .map((part) =>
      typeof part === 'string'
        ? { type: 'text', text: part }
        : { type: 'text', text: part.text, marks: part.marks?.map((type) => ({ type })) },
    ),
});
const heading = (text: string, level = 2) => ({
  type: 'heading',
  attrs: { level },
  content: [{ type: 'text', text }],
});
const bullets = (...items: string[]) => ({
  type: 'bulletList',
  content: items.map((item) => ({ type: 'listItem', content: [paragraph(item)] })),
});
const callout = (tint: string, text: string) => ({
  type: 'callout',
  attrs: { tint },
  content: [paragraph(text)],
});

export interface BuiltInTemplate {
  id: string;
  name: string;
  content: { type: 'doc'; content: object[] };
}

export const BUILT_IN_TEMPLATES: BuiltInTemplate[] = [
  { id: 'blank', name: 'blank page', content: { type: 'doc', content: [paragraph()] } },
  {
    id: 'announcement',
    name: 'announcement',
    content: {
      type: 'doc',
      content: [
        paragraph({ text: 'One line on what shipped and why it matters.', marks: ['italic'] }),
        heading('What it is'),
        paragraph(),
        heading('Why we built it'),
        paragraph(),
        heading('Try it'),
        paragraph(),
      ],
    },
  },
  {
    id: 'release-notes',
    name: 'release notes',
    content: {
      type: 'doc',
      content: [
        callout('info', 'Version, date and the one-line summary.'),
        heading('Highlights'),
        bullets('', ''),
        heading('Changes'),
        bullets('', '', ''),
        heading('Upgrading'),
        paragraph(),
      ],
    },
  },
  {
    id: 'tutorial',
    name: 'tutorial',
    content: {
      type: 'doc',
      content: [
        paragraph({ text: 'What the reader will be able to do at the end.', marks: ['italic'] }),
        heading('Before you start'),
        bullets('', ''),
        heading('Step 1'),
        paragraph(),
        { type: 'codeBlock', attrs: { language: null }, content: [] },
        heading('Step 2'),
        paragraph(),
        heading('Where to go next'),
        paragraph(),
      ],
    },
  },
];
