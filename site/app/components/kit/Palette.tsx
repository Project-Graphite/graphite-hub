import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { Link, useNavigate, useRevalidator } from 'react-router';
import { useRoot } from '../../hub';
import { directoryIsFollowed } from '../../live';
import { search } from '../../search';
import { hitKeys, HitRow } from './directory';

const OPEN = 'graphite:search';
const RESULTS = 'palette-results';

const JUMPS = [
  { to: '/members', label: 'members' },
  { to: '/epics', label: 'epics' },
  { to: '/projects', label: 'projects' },
  { to: '/blog', label: 'blog' },
  { to: '/changelog', label: 'changelog' },
  { to: '/messages', label: 'messages' },
  { to: '/status', label: 'status' },
];

const optionId = (index: number) => `${RESULTS}-${index}`;

export const openSearch = () => dispatchEvent(new Event(OPEN));

export function Palette() {
  const root = useRoot();
  const navigate = useNavigate();
  const { revalidate } = useRevalidator();
  const dialog = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const hits = root ? search(root.directory, query, 16) : [];
  const show = useEffectEvent(() => {
    if (dialog.current?.open) {
      return;
    }
    dialog.current?.showModal();
    if (!directoryIsFollowed()) {
      void revalidate();
    }
  });

  useEffect(() => {
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

  useEffect(() => {
    document.getElementById(optionId(active))?.scrollIntoView({ block: 'nearest' });
  }, [active]);

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
          role="combobox"
          aria-label="Search"
          aria-autocomplete="list"
          aria-expanded={hits.length > 0}
          aria-controls={hits.length > 0 ? RESULTS : undefined}
          aria-activedescendant={hits.length > 0 ? optionId(active) : undefined}
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
          {root && hits.length > 0 && (
            <div id={RESULTS} role="listbox" aria-label="Results" className="grid gap-[0.35rem]">
              {hits.map((hit, index) => (
                <div
                  key={`${hit.kind}:${hit.to}`}
                  id={optionId(index)}
                  role="option"
                  aria-selected={index === active}
                >
                  <HitRow
                    hit={hit}
                    needle={query}
                    directory={root.directory}
                    active={index === active}
                    onHover={() => setActive(index)}
                    onPick={close}
                  />
                </div>
              ))}
            </div>
          )}
          {hits.length === 0 && (
            <p className="none" role="status">
              nothing matches “{query.trim()}”
            </p>
          )}
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
