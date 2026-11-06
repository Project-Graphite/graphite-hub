import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router';
import { useRoot } from '../hub';
import { accentStyle } from './kit/basics';

interface Entry {
  to: string;
  label: string;
}

function Item({ to, label, close }: Entry & { close: () => void }) {
  return (
    <Link role="menuitem" tabIndex={-1} to={to} onClick={close}>
      {label}
    </Link>
  );
}

function Group({ entries, close }: { entries: Entry[]; close: () => void }) {
  return entries.map((entry) => <Item key={entry.to} {...entry} close={close} />);
}

export default function AccountMenu() {
  const root = useRoot();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const wantsFocus = useRef(false);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const viewer = root?.viewer ?? null;
  const member = viewer
    ? root!.directory.members.find(
        (candidate) => candidate.github.toLowerCase() === viewer.login.toLowerCase(),
      )
    : undefined;

  useEffect(() => {
    if (!open) {
      return;
    }
    const away = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menu.current?.contains(target) && !button.current?.contains(target)) {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', away);
    if (wantsFocus.current) {
      wantsFocus.current = false;
      menu.current?.querySelector<HTMLElement>('[role=menuitem]')?.focus();
    }
    return () => document.removeEventListener('pointerdown', away);
  }, [open]);

  const close = () => setOpen(false);
  const items = () => [...(menu.current?.querySelectorAll<HTMLElement>('[role=menuitem]') ?? [])];
  const focusItem = (index: number) => {
    const list = items();
    list[((index % list.length) + list.length) % list.length]?.focus();
  };
  const onKeyDown = (event: KeyboardEvent) => {
    const current = items().indexOf(document.activeElement as HTMLElement);
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (open) {
          focusItem(current + 1);
        } else {
          wantsFocus.current = true;
          setOpen(true);
        }
        break;
      case 'ArrowUp':
        event.preventDefault();
        focusItem(current - 1);
        break;
      case 'Home':
        event.preventDefault();
        focusItem(0);
        break;
      case 'End':
        event.preventDefault();
        focusItem(-1);
        break;
      case 'Escape':
        if (open) {
          event.preventDefault();
          close();
          button.current?.focus();
        }
        break;
      case 'Tab':
        close();
        break;
    }
  };

  const mine: Entry[] = member
    ? [
        { to: member.path, label: 'your page' },
        { to: `${member.path}/edit`, label: 'edit your page' },
        ...(root!.directory.projects.some((project) => project.owner === member.handle)
          ? [{ to: `${member.path}/edit?project`, label: 'edit your projects' }]
          : []),
        { to: '/blog/mine', label: viewer?.owner ? 'every post' : 'your posts' },
        { to: '/blog/new', label: 'write a post' },
      ]
    : [];
  const owner: Entry[] = viewer?.owner
    ? [
        { to: '/admin', label: 'admin' },
        { to: `${pathname}?edit`, label: 'edit this page' },
        { to: '/messages', label: 'moderate messages' },
        { to: '/admin#subscribers', label: 'subscribers' },
        ...(import.meta.env.DEV ? [{ to: '/kit', label: 'kit' }] : []),
      ]
    : [];

  let avatar: ReactNode;
  if (viewer) {
    avatar = (
      <span className="avatar xs" style={accentStyle(member?.accent)}>
        <img src={viewer.avatarUrl} alt="" width={20} height={20} />
      </span>
    );
  } else {
    avatar = (
      <span className="avatar xs guest">
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.5}>
          <circle cx="10" cy="7" r="3.25" />
          <path d="M3.5 17.5a6.5 6.5 0 0 1 13 0" />
        </svg>
      </span>
    );
  }

  return (
    <div className="account" onKeyDown={onKeyDown}>
      <button
        ref={button}
        type="button"
        className="account-button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls="account-menu"
        aria-label={viewer ? `Signed in as ${viewer.login}` : 'Account'}
        onClick={() => setOpen(!open)}
      >
        {avatar}
      </button>
      {open && (
        <div ref={menu} id="account-menu" role="menu" className="menu">
          {viewer ? (
            <>
              <div className="menu-head">
                <strong>{member?.name ?? viewer.login}</strong>
                <span>
                  @{viewer.login}
                  {viewer.owner && ' · owner'}
                </span>
              </div>
              {mine.length > 0 && (
                <>
                  <hr />
                  <Group entries={mine} close={close} />
                </>
              )}
              {owner.length > 0 && (
                <>
                  <hr />
                  <Group entries={owner} close={close} />
                </>
              )}
              <hr />
              <Item to="/status" label="status" close={close} />
              <form method="post" action="/auth/sign-out">
                <input type="hidden" name="csrf" value={root?.csrf ?? ''} />
                <button type="submit" role="menuitem" tabIndex={-1}>
                  sign out
                </button>
              </form>
            </>
          ) : (
            <>
              <a
                role="menuitem"
                tabIndex={-1}
                href={`/auth/sign-in?return=${encodeURIComponent(pathname)}`}
              >
                sign in
              </a>
              <hr />
              <Item to="/status" label="status" close={close} />
            </>
          )}
        </div>
      )}
    </div>
  );
}
