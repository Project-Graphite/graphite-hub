import { WebSocketStatus } from '@hocuspocus/provider';
import type { Editor } from '@tiptap/core';
import Collaboration from '@tiptap/extension-collaboration';
import { CollaborationCaret } from '@tiptap/extension-collaboration-caret';
import { Placeholder } from '@tiptap/extensions';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type FocusEvent,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import { readingMinutes } from '../posts';
import { CALLOUT_TINTS, columnsOf, postExtensions } from './extensions';
import { holdSession, openSession } from './session';
import { slashMenu } from './slash';

export interface Peer {
  handle: string;
  name: string;
  color: string;
}

export interface EditorReport {
  connection: 'connecting' | 'online' | 'offline' | 'refused';
  words: number;
  minutes: number;
  peers: Peer[];
}

export interface PostEditorProps {
  id: string;
  token: string;
  login: string;
  user: { name: string; color: string; handle: string };
  editable: boolean;
  upload: (file: File) => Promise<string | null>;
  report: (state: EditorReport) => void;
}

const YOUTUBE = /^https:\/\/(www\.)?(youtube\.com|youtu\.be)\//;

function caret(user: Record<string, string>) {
  const cursor = document.createElement('span');
  cursor.className = 'caret';
  cursor.style.setProperty('--caret', user.color);
  const label = document.createElement('span');
  label.className = 'caret-label';
  label.textContent = user.name;
  cursor.append(label);
  return cursor;
}

function selection(user: Record<string, string>) {
  return { style: `background-color: color-mix(in srgb, ${user.color} 28%, transparent)` };
}

type Ask = { kind: 'link' | 'video'; value: string } | null;

const StopContext = createContext<(label: string) => 0 | -1>(() => 0);

function Mark({
  on,
  label,
  glyph,
  act,
  className = '',
}: {
  on?: boolean;
  label: string;
  glyph: string;
  act: () => void;
  className?: string;
}) {
  const stop = useContext(StopContext);
  return (
    <button
      type="button"
      className={className}
      aria-label={label}
      title={label}
      aria-pressed={on}
      tabIndex={stop(label)}
      onMouseDown={(event) => event.preventDefault()}
      onClick={act}
    >
      {glyph}
    </button>
  );
}

const STEP: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1 };

function useRovingFocus(shape: string) {
  const box = useRef<HTMLDivElement>(null);
  const [current, setCurrent] = useState('Undo');
  useEffect(() => {
    if (!box.current?.querySelector('[tabindex="0"]')) {
      setCurrent('Undo');
    }
  }, [shape]);
  const stops = () => [...(box.current?.querySelectorAll<HTMLElement>('button, select') ?? [])];
  return {
    box,
    stop: (label: string): 0 | -1 => (label === current ? 0 : -1),
    onFocus: (event: FocusEvent<HTMLDivElement>) =>
      setCurrent(event.target.getAttribute('aria-label') ?? current),
    onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => {
      const all = stops();
      const index = all.indexOf(event.target as HTMLElement);
      const next = { Home: 0, End: all.length - 1 }[event.key] ?? index + STEP[event.key];
      if (index < 0 || Number.isNaN(next)) {
        return;
      }
      event.preventDefault();
      all[(next + all.length) % all.length].focus();
    },
  };
}

function Toolbar({
  editor,
  pickImage,
  ask,
}: {
  editor: Editor;
  pickImage: () => void;
  ask: (kind: 'link' | 'video') => void;
}) {
  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      bold: current.isActive('bold'),
      italic: current.isActive('italic'),
      strike: current.isActive('strike'),
      code: current.isActive('code'),
      link: current.isActive('link'),
      highlight: current.isActive('highlight'),
      block: current.isActive('heading', { level: 2 })
        ? 'heading2'
        : current.isActive('heading', { level: 3 })
          ? 'heading3'
          : current.isActive('heading', { level: 4 })
            ? 'heading4'
            : current.isActive('codeBlock')
              ? 'code'
              : current.isActive('callout')
                ? 'callout'
                : current.isActive('blockquote')
                  ? 'quote'
                  : 'text',
      bullets: current.isActive('bulletList'),
      numbers: current.isActive('orderedList'),
      checklist: current.isActive('taskList'),
      tint: current.getAttributes('callout').tint as string | undefined,
      inTable: current.isActive('table'),
      canUndo: current.can().undo(),
      canRedo: current.can().redo(),
    }),
  });
  const { box, stop, onFocus, onKeyDown } = useRovingFocus(`${state.block}:${state.inTable}`);
  const chain = () => editor.chain().focus();
  const turn = (block: string) => {
    const base = chain().clearNodes();
    switch (block) {
      case 'heading2':
      case 'heading3':
      case 'heading4':
        base.setHeading({ level: Number(block.slice(-1)) as 2 | 3 | 4 }).run();
        break;
      case 'code':
        base.toggleCodeBlock().run();
        break;
      case 'callout':
        base.toggleWrap('callout').run();
        break;
      case 'quote':
        base.toggleBlockquote().run();
        break;
      default:
        base.setParagraph().run();
    }
  };
  return (
    <StopContext value={stop}>
      <div
        ref={box}
        className="toolbar"
        role="toolbar"
        aria-label="Formatting"
        onFocus={onFocus}
        onKeyDown={onKeyDown}
      >
        <div className="set">
          <Mark label="Undo" glyph="↶" act={() => chain().undo().run()} />
          <Mark label="Redo" glyph="↷" act={() => chain().redo().run()} />
        </div>
        <select
          aria-label="Block style"
          tabIndex={stop('Block style')}
          value={state.block}
          onChange={(event) => turn(event.target.value)}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <option value="text">text</option>
          <option value="heading2">heading</option>
          <option value="heading3">subheading</option>
          <option value="heading4">small heading</option>
          <option value="quote">quote</option>
          <option value="callout">callout</option>
          <option value="code">code block</option>
        </select>
        <div className="set">
          <Mark
            on={state.bold}
            label="Bold"
            glyph="B"
            className="b"
            act={() => chain().toggleBold().run()}
          />
          <Mark
            on={state.italic}
            label="Italic"
            glyph="I"
            className="i"
            act={() => chain().toggleItalic().run()}
          />
          <Mark
            on={state.strike}
            label="Strikethrough"
            glyph="S"
            className="s"
            act={() => chain().toggleStrike().run()}
          />
          <Mark
            on={state.code}
            label="Inline code"
            glyph="</>"
            className="mono"
            act={() => chain().toggleCode().run()}
          />
          <Mark
            on={state.highlight}
            label="Highlight"
            glyph="◐"
            act={() => chain().toggleHighlight().run()}
          />
          <Mark
            on={state.link}
            label="Link"
            glyph="⤷"
            act={() => (state.link ? chain().unsetLink().run() : ask('link'))}
          />
        </div>
        <div className="set">
          <Mark
            on={state.bullets}
            label="Bulleted list"
            glyph="•≡"
            act={() => chain().toggleBulletList().run()}
          />
          <Mark
            on={state.numbers}
            label="Numbered list"
            glyph="1≡"
            act={() => chain().toggleOrderedList().run()}
          />
          <Mark
            on={state.checklist}
            label="Checklist"
            glyph="☑"
            act={() => chain().toggleTaskList().run()}
          />
        </div>
        <div className="set">
          <Mark label="Image" glyph="▣" act={pickImage} />
          <Mark label="Video" glyph="▶" act={() => ask('video')} />
          <Mark
            label="Table"
            glyph="▦"
            act={() => chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
          />
          <Mark
            label="Two columns"
            glyph="▯▯"
            act={() => chain().insertContent(columnsOf(2)).run()}
          />
          <Mark label="Divider" glyph="—" act={() => chain().setHorizontalRule().run()} />
        </div>
        {state.block === 'callout' && (
          <div className="set tints" role="group" aria-label="Callout tint">
            {CALLOUT_TINTS.map((tint) => (
              <button
                key={tint}
                type="button"
                data-tint={tint}
                aria-label={tint}
                aria-pressed={state.tint === tint}
                tabIndex={stop(tint)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => chain().updateAttributes('callout', { tint }).run()}
              />
            ))}
          </div>
        )}
        {state.inTable && (
          <div className="set">
            <Mark label="Add row" glyph="+row" act={() => chain().addRowAfter().run()} />
            <Mark label="Add column" glyph="+col" act={() => chain().addColumnAfter().run()} />
            <Mark label="Delete row" glyph="−row" act={() => chain().deleteRow().run()} />
            <Mark label="Delete column" glyph="−col" act={() => chain().deleteColumn().run()} />
            <Mark label="Delete table" glyph="×" act={() => chain().deleteTable().run()} />
          </div>
        )}
      </div>
    </StopContext>
  );
}

export default function PostEditor({
  id,
  token,
  login,
  user,
  editable,
  upload,
  report,
}: PostEditorProps) {
  const [ask, setAsk] = useState<Ask>(null);
  const [state, setState] = useState<EditorReport>({
    connection: 'connecting',
    words: 0,
    minutes: 1,
    peers: [],
  });
  useEffect(() => report(state), [report, state]);

  const session = openSession(id, login, token);
  useEffect(() => holdSession(id, login), [id, login]);

  const tell = (current: Editor | null) => {
    if (current?.isDestroyed) {
      return;
    }
    const text = current?.getText({ blockSeparator: ' ' }) ?? '';
    setState((previous) => ({
      ...previous,
      words: text.split(/\s+/).filter(Boolean).length,
      minutes: readingMinutes(text),
    }));
  };

  const insertFiles = async (current: Editor, files: File[], at?: number) => {
    for (const file of files.filter((candidate) => candidate.type.startsWith('image/'))) {
      const url = await upload(file);
      if (url) {
        const image = { src: url, alt: file.name.replace(/\.[^.]+$/, '') };
        const chain = current.chain().focus();
        (at === undefined
          ? chain.setImage(image)
          : chain.insertContentAt(at, { type: 'image', attrs: image })
        ).run();
      }
    }
  };

  const pickImage = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png,image/webp,image/gif';
    input.multiple = true;
    input.onchange = () => {
      if (editor) {
        void insertFiles(editor, [...(input.files ?? [])]);
      }
    };
    input.click();
  };

  const editor = useEditor(
    {
      editable,
      immediatelyRender: false,
      extensions: [
        ...postExtensions(true),
        Placeholder.configure({ placeholder: editable ? 'Write, or type / for a block' : '' }),
        Collaboration.configure({ document: session.document }),
        CollaborationCaret.configure({
          provider: session.provider,
          user,
          render: caret,
          selectionRender: selection,
        }),
        slashMenu({ pickImage, askVideo: () => setAsk({ kind: 'video', value: '' }) }),
      ],
      editorProps: {
        attributes: { class: 'prose writing', 'aria-label': 'Post body' },
        handlePaste: (_view, event) => {
          const files = [...(event.clipboardData?.files ?? [])];
          if (files.length === 0 || !editor) {
            return false;
          }
          void insertFiles(editor, files);
          return true;
        },
        handleDrop: (view, event, _slice, moved) => {
          const files = [...(event.dataTransfer?.files ?? [])];
          if (moved || files.length === 0 || !editor) {
            return false;
          }
          void insertFiles(
            editor,
            files,
            view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos,
          );
          return true;
        },
      },
      onUpdate: ({ editor: current }) => tell(current),
    },
    [session, editable],
  );

  useEffect(() => {
    const { provider, document } = session;
    const connection = (value: EditorReport['connection']) =>
      setState((previous) => ({ ...previous, connection: value }));
    const onStatus = ({ status }: { status: WebSocketStatus }) =>
      connection(status === WebSocketStatus.Connecting ? 'connecting' : 'offline');
    const onAuthenticated = () => connection('online');
    const onRefused = () => connection('refused');
    const onAwareness = ({ states }: { states: { clientId: number; user?: Peer }[] }) => {
      const seen = new Map<string, Peer>();
      for (const entry of states) {
        if (entry.user?.handle && entry.clientId !== document.clientID) {
          seen.set(entry.user.handle, entry.user);
        }
      }
      setState((previous) => ({ ...previous, peers: [...seen.values()] }));
    };
    provider.on('status', onStatus);
    provider.on('authenticated', onAuthenticated);
    provider.on('authenticationFailed', onRefused);
    provider.on('awarenessUpdate', onAwareness);
    if (provider.isAuthenticated) {
      onAuthenticated();
    }
    return () => {
      provider.off('status', onStatus);
      provider.off('authenticated', onAuthenticated);
      provider.off('authenticationFailed', onRefused);
      provider.off('awarenessUpdate', onAwareness);
    };
  }, [session]);

  useEffect(() => {
    if (editor) {
      const refresh = () => tell(editor);
      void session.draft.ready.then(refresh);
      session.provider.on('synced', refresh);
      return () => {
        session.provider.off('synced', refresh);
      };
    }
  }, [session, editor]);

  const answer = (event: FormEvent) => {
    event.preventDefault();
    if (!editor || !ask) {
      return;
    }
    const value = ask.value.trim();
    if (ask.kind === 'link' && /^(https?:\/\/|mailto:)/i.test(value)) {
      editor.chain().focus().extendMarkRange('link').setLink({ href: value }).run();
    } else if (ask.kind === 'video' && YOUTUBE.test(value)) {
      editor.chain().focus().setYoutubeVideo({ src: value }).run();
    }
    setAsk(null);
  };

  return (
    <div className="writer" data-connection={state.connection}>
      {editable && editor && (
        <Toolbar
          editor={editor}
          pickImage={pickImage}
          ask={(kind) => setAsk({ kind, value: '' })}
        />
      )}
      {ask && (
        <form className="ask" onSubmit={answer}>
          <input
            autoFocus
            className="field"
            type="url"
            placeholder={ask.kind === 'link' ? 'https://…' : 'https://www.youtube.com/watch?v=…'}
            value={ask.value}
            onChange={(event) => setAsk({ ...ask, value: event.target.value })}
            onKeyDown={(event) => event.key === 'Escape' && setAsk(null)}
          />
          <button type="submit" className="chip-button">
            {ask.kind === 'link' ? 'link' : 'embed'}
          </button>
          <button type="button" className="chip-button" onClick={() => setAsk(null)}>
            cancel
          </button>
        </form>
      )}
      <EditorContent editor={editor} />
    </div>
  );
}
