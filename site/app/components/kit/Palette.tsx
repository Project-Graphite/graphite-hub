import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useRoot } from '../../hub';
import { search } from '../../search';
import { hitKeys, HitRow } from './directory';

const OPEN = 'graphite:search';

const JUMPS = [
  { to: '/members', label: 'members' },
  { to: '/epics', label: 'epics' },
  { to: '/projects', label: 'projects' },
  { to: '/blog', label: 'blog' },
  { to: '/changelog', label: 'changelog' },
  { to: '/messages', label: 'messages' },
  { to: '/status', label: 'status' },
];

export const openSearch = () => dispatchEvent(new Event(OPEN));

export function Palette() {
  const root = useRoot();
  const navigate = useNavigate();
  const dialog = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const hits = root ? search(root.directory, query, 16) : [];

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

  const close = () => {
    dialog.current?.close();
    setQuery('');
    setActive(0);
  };
  const go = (to: string) => {
    close();
    navigate(to);
  };

  return (
    <dialog
      ref={dialog}
      aria-label="Search"
      className="palette"
      onClick={(event) => event.target === dialog.current && close()}
    >
      <div className="search-box">
        <input
          autoFocus
          autoComplete="off"
          aria-label="Search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
          }}
          onKeyDown={(event) =>
            hitKeys(hits.length, active, setActive, () => go(hits[active].to))(event)
          }
        />
        <button type="button" className="kbd" onClick={close}>
          esc
        </button>
      </div>
      {query.trim() ? (
        <div className="hits">
          {root &&
            hits.map((hit, index) => (
              <HitRow
                key={`${hit.kind}:${hit.to}`}
                hit={hit}
                needle={query}
                directory={root.directory}
                active={index === active}
                onHover={() => setActive(index)}
                onPick={close}
              />
            ))}
          {hits.length === 0 && <p className="none">nothing matches “{query.trim()}”</p>}
          <Link
            to={`/search?q=${encodeURIComponent(query.trim())}`}
            className="all"
            onClick={close}
          >
            every match →
          </Link>
        </div>
      ) : (
        <div className="jumps">
          {JUMPS.map((jump) => (
            <Link key={jump.to} to={jump.to} onClick={close}>
              {jump.label}
            </Link>
          ))}
        </div>
      )}
    </dialog>
  );
}
