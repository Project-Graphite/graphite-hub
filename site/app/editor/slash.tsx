import { Extension, type ChainedCommands, type Editor } from '@tiptap/core';
import { ReactRenderer } from '@tiptap/react';
import Suggestion, { type SuggestionKeyDownProps, type SuggestionProps } from '@tiptap/suggestion';
import { useImperativeHandle, useState, type Ref } from 'react';
import { columnsOf } from './extensions';

export interface Choice {
  id: string;
  group: 'text' | 'lists' | 'media' | 'blocks';
  label: string;
  hint: string;
  words: string;
  run: (chain: ChainedCommands, editor: Editor) => void;
}

export interface SlashActions {
  pickImage: (editor: Editor) => void;
  askVideo: (editor: Editor) => void;
}

export function choices({ pickImage, askVideo }: SlashActions): Choice[] {
  return [
    {
      id: 'text',
      group: 'text',
      label: 'text',
      hint: 'paragraph',
      words: 'text paragraph plain',
      run: (chain) => chain.setParagraph().run(),
    },
    {
      id: 'heading2',
      group: 'text',
      label: 'heading',
      hint: '##',
      words: 'heading title h2 section',
      run: (chain) => chain.setHeading({ level: 2 }).run(),
    },
    {
      id: 'heading3',
      group: 'text',
      label: 'subheading',
      hint: '###',
      words: 'subheading heading h3',
      run: (chain) => chain.setHeading({ level: 3 }).run(),
    },
    {
      id: 'quote',
      group: 'text',
      label: 'quote',
      hint: '>',
      words: 'quote blockquote',
      run: (chain) => chain.toggleBlockquote().run(),
    },
    {
      id: 'callout',
      group: 'text',
      label: 'callout',
      hint: 'aside',
      words: 'callout note tip info warning danger aside box',
      run: (chain) => chain.toggleWrap('callout').run(),
    },
    {
      id: 'divider',
      group: 'text',
      label: 'divider',
      hint: '---',
      words: 'divider line separator rule hr',
      run: (chain) => chain.setHorizontalRule().run(),
    },
    {
      id: 'bullets',
      group: 'lists',
      label: 'bulleted list',
      hint: '-',
      words: 'bulleted list bullets unordered',
      run: (chain) => chain.toggleBulletList().run(),
    },
    {
      id: 'numbers',
      group: 'lists',
      label: 'numbered list',
      hint: '1.',
      words: 'numbered list ordered numbers',
      run: (chain) => chain.toggleOrderedList().run(),
    },
    {
      id: 'checklist',
      group: 'lists',
      label: 'checklist',
      hint: '[ ]',
      words: 'checklist todo tasks checkbox',
      run: (chain) => chain.toggleTaskList().run(),
    },
    {
      id: 'toggle',
      group: 'lists',
      label: 'toggle',
      hint: 'fold',
      words: 'toggle collapse fold details summary',
      run: (chain) => chain.setDetails().run(),
    },
    {
      id: 'image',
      group: 'media',
      label: 'image',
      hint: 'upload',
      words: 'image picture photo upload figure',
      run: (chain, editor) => {
        chain.run();
        pickImage(editor);
      },
    },
    {
      id: 'video',
      group: 'media',
      label: 'video',
      hint: 'youtube',
      words: 'video youtube embed',
      run: (chain, editor) => {
        chain.run();
        askVideo(editor);
      },
    },
    {
      id: 'code',
      group: 'blocks',
      label: 'code block',
      hint: '```',
      words: 'code block snippet pre',
      run: (chain) => chain.toggleCodeBlock().run(),
    },
    {
      id: 'table',
      group: 'blocks',
      label: 'table',
      hint: '3 × 3',
      words: 'table grid rows cells',
      run: (chain) => chain.insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
    },
    {
      id: 'columns2',
      group: 'blocks',
      label: 'two columns',
      hint: 'side by side',
      words: 'columns two layout side',
      run: (chain) => chain.insertContent(columnsOf(2)).run(),
    },
    {
      id: 'columns3',
      group: 'blocks',
      label: 'three columns',
      hint: 'side by side',
      words: 'columns three layout side',
      run: (chain) => chain.insertContent(columnsOf(3)).run(),
    },
  ];
}

interface ListHandle {
  onKeyDown: (props: SuggestionKeyDownProps) => boolean;
}

function SlashList({ items, command, ref }: SuggestionProps<Choice> & { ref: Ref<ListHandle> }) {
  const [active, setActive] = useState(0);
  const [shown, setShown] = useState(items);
  if (shown !== items) {
    setShown(items);
    setActive(0);
  }
  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (items.length === 0) {
        return false;
      }
      if (event.key === 'ArrowDown') {
        setActive((current) => (current + 1) % items.length);
      } else if (event.key === 'ArrowUp') {
        setActive((current) => (current - 1 + items.length) % items.length);
      } else if (event.key === 'Enter' || event.key === 'Tab') {
        command(items[active]);
      } else {
        return false;
      }
      return true;
    },
  }));
  return (
    <div className="slash" role="listbox" aria-label="Insert a block">
      {items.length === 0 && <span className="empty">nothing like that</span>}
      {items.map((item, index) => {
        return (
          <div key={item.id}>
            {items[index - 1]?.group !== item.group && <span className="group">{item.group}</span>}
            <button
              type="button"
              role="option"
              aria-selected={index === active}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActive(index)}
              onClick={() => command(item)}
            >
              <span>{item.label}</span>
              <kbd>{item.hint}</kbd>
            </button>
          </div>
        );
      })}
    </div>
  );
}

function popup() {
  let renderer: ReactRenderer<ListHandle, SuggestionProps<Choice>> | undefined;
  const place = (props: SuggestionProps<Choice>) => {
    const box = props.clientRect?.();
    const element = renderer?.element;
    if (!box || !element) {
      return;
    }
    const height = element.offsetHeight;
    const below = box.bottom + 8 + height <= innerHeight;
    element.style.position = 'fixed';
    element.style.zIndex = '50';
    element.style.left = `${Math.max(16, Math.min(box.left, innerWidth - element.offsetWidth - 16))}px`;
    element.style.top = `${below ? box.bottom + 8 : Math.max(8, box.top - height - 8)}px`;
  };
  const close = () => {
    renderer?.destroy();
    renderer?.element.remove();
    renderer = undefined;
  };
  return {
    onStart: (props: SuggestionProps<Choice>) => {
      renderer = new ReactRenderer(SlashList, { props, editor: props.editor });
      document.body.append(renderer.element);
      place(props);
    },
    onUpdate: (props: SuggestionProps<Choice>) => {
      renderer?.updateProps(props);
      place(props);
    },
    onKeyDown: (props: SuggestionKeyDownProps) => {
      if (props.event.key === 'Escape') {
        close();
        return true;
      }
      return renderer?.ref?.onKeyDown(props) ?? false;
    },
    onExit: close,
  };
}

export function slashMenu(actions: SlashActions) {
  const list = choices(actions);
  return Extension.create({
    name: 'slashMenu',
    addProseMirrorPlugins() {
      return [
        Suggestion<Choice>({
          editor: this.editor,
          char: '/',
          startOfLine: false,
          items: ({ query }) => {
            const wanted = query.trim().toLowerCase();
            return list.filter(
              (choice) => choice.label.includes(wanted) || choice.words.includes(wanted),
            );
          },
          command: ({ editor, range, props }) =>
            props.run(editor.chain().focus().deleteRange(range), editor),
          render: popup,
        }),
      ];
    },
  });
}
