import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { useRoot } from '../../hub';
import { search } from '../../search';

const OPEN = 'graphite:search';

export const openSearch = () => dispatchEvent(new Event(OPEN));

export function Palette() {
  const root = useRoot();
  const navigate = useNavigate();
  const dialog = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const hits = root ? search(root.directory, query, 12) : [];

  useEffect(() => {
    const show = () => {
      if (!dialog.current?.open) {
        dialog.current?.showModal();
      }
    };
    const open = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (
        event.key === '/' &&
        !event.metaKey &&
        !event.ctrlKey &&
        !target.closest('input, textarea, select, [contenteditable]')
      ) {
        event.preventDefault();
        show();
      }
    };
    addEventListener('keydown', open);
    addEventListener(OPEN, show);
    return () => {
      removeEventListener('keydown', open);
      removeEventListener(OPEN, show);
    };
  }, []);

  const go = (to: string) => {
    dialog.current?.close();
    setQuery('');
    navigate(to);
  };

  return (
    <dialog
      ref={dialog}
      aria-label="Search"
      className="palette"
      onClick={(event) => event.target === dialog.current && dialog.current?.close()}
    >
      <input
        autoFocus
        className="w-full border-0 border-b border-line-soft bg-transparent px-4 py-3 text-ink outline-none"
        placeholder="Search members, projects and releases"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setActive(0);
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setActive((index) => Math.min(index + 1, hits.length - 1));
          } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setActive((index) => Math.max(index - 1, 0));
          } else if (event.key === 'Enter' && hits[active]) {
            go(hits[active].to);
          }
        }}
      />
      <ul role="listbox" className="max-h-96 overflow-y-auto p-2">
        {hits.map((hit, index) => (
          <li key={`${hit.kind}:${hit.to}`} role="option" aria-selected={index === active}>
            <button
              type="button"
              className={`grid w-full gap-0.5 rounded-md px-3 py-2 text-left ${index === active ? 'bg-paper' : ''}`}
              onMouseEnter={() => setActive(index)}
              onClick={() => go(hit.to)}
            >
              <span className="flex items-baseline justify-between gap-3">
                <strong className="font-semibold">{hit.title}</strong>
                <span className="mono-sm text-faint">{hit.kind}</span>
              </span>
              <span className="truncate text-sm text-muted">{hit.detail}</span>
            </button>
          </li>
        ))}
        {query && hits.length === 0 && (
          <li className="mono-sm px-3 py-2 text-faint">Nothing matches “{query}”.</li>
        )}
      </ul>
    </dialog>
  );
}
