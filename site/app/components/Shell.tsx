import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router';
import { useRoot } from '../hub';
import { Sky } from '../motion/canvases';
import { MotionContext } from '../motion/motion';
import { defaults, visible, type NAV } from '../settings';
import AccountMenu from './AccountMenu';
import { Editable, useEditing } from './kit/Editable';
import { Icon } from './kit/icons';
import { LivePulse } from './kit/live';
import { openSearch, Palette } from './kit/Palette';
import { SubscribeForm } from './kit/subscribe';

const NAV_TARGET: Record<(typeof NAV)[number], { to: string; label: string }> = {
  members: { to: '/members', label: 'members' },
  epics: { to: '/epics', label: 'epics' },
  projects: { to: '/projects', label: 'projects' },
  blog: { to: '/blog', label: 'blog' },
  changelog: { to: '/changelog', label: 'changelog' },
  messages: { to: '/messages', label: 'messages' },
  status: { to: '/status', label: 'status' },
  github: { to: 'https://github.com/project-graphite', label: 'github' },
};

export default function Shell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const root = useRoot();
  const settings = root?.settings ?? defaults();
  const editing = useEditing();
  const header = useRef<HTMLElement>(null);
  const [menuAt, setMenuAt] = useState<string | null>(null);
  const menuOpen = menuAt === pathname;

  useEffect(() => {
    if (!menuOpen) {
      return;
    }
    const away = (event: PointerEvent) => {
      if (!header.current?.contains(event.target as Node)) {
        setMenuAt(null);
      }
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [menuOpen]);

  return (
    <MotionContext value={settings['site.motion']}>
      <Sky />
      <a href="#content" className="skip-link">
        skip to content
      </a>
      <header
        ref={header}
        className="frame-header"
        onKeyDown={(event) => {
          if (event.key === 'Escape' && menuOpen) {
            setMenuAt(null);
            header.current?.querySelector<HTMLElement>('.frame-menu')?.focus();
          }
        }}
      >
        <div className="shell">
          <Link to="/" className="brand">
            <svg
              aria-hidden="true"
              viewBox="-3 -3 36 46"
              fill="none"
              stroke="currentColor"
              strokeWidth={6}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M5.62 25 L0 40 M24.38 25 L30 40" />
              <path d="M15 0 L8.25 18 H21.75 Z" fill="currentColor" />
            </svg>
            {settings['site.name']}
          </Link>
          <nav
            id="primary-nav"
            aria-label="Primary"
            className="frame-nav"
            data-open={menuOpen || undefined}
          >
            {visible(settings['site.nav']).map((id) => {
              const { to, label } = NAV_TARGET[id as keyof typeof NAV_TARGET];
              return to.startsWith('http') ? (
                <a key={id} href={to}>
                  {label}
                  <Icon name="external" />
                </a>
              ) : (
                <NavLink key={id} to={to}>
                  {label}
                </NavLink>
              );
            })}
            <button
              type="button"
              className="frame-search"
              onClick={() => {
                setMenuAt(null);
                openSearch();
              }}
            >
              search
              <span className="kbd">/</span>
            </button>
          </nav>
          <div className="frame-status">
            {root && <LivePulse />}
            <AccountMenu />
            <button
              type="button"
              className="frame-menu"
              aria-expanded={menuOpen}
              aria-controls="primary-nav"
              onClick={() => setMenuAt(menuOpen ? null : pathname)}
            >
              menu
              <Icon name={menuOpen ? 'close' : 'menu'} />
            </button>
          </div>
        </div>
      </header>

      <main id="content" className="shell frame-content">
        {children}
      </main>

      <footer className="frame-footer">
        <div className="shell">
          <p className="footer-line">
            <Editable setting="site.footer" />
            <Link to="/privacy">privacy</Link>
          </p>
          <div className="footer-subscribe">
            <Link to="/subscribe" className="footer-lead">
              new writing, by email
            </Link>
            <SubscribeForm scope={{ kind: 'all' }} cadence="each" compact />
          </div>
        </div>
      </footer>
      <Palette />
      {editing && (
        <div className="edit-bar">
          <span>editing the page</span>
          <Link to={pathname}>done</Link>
        </div>
      )}
    </MotionContext>
  );
}

export function Page({ rail, children }: { rail?: ReactNode; children: ReactNode }) {
  const railBox = useRef<HTMLDivElement>(null);
  const hasRail = Boolean(rail);
  useEffect(() => {
    const element = railBox.current;
    if (!element) {
      return;
    }
    const observer = new ResizeObserver(([entry]) =>
      element.style.setProperty(
        '--rail-height',
        `${Math.ceil(entry.borderBoxSize[0].blockSize)}px`,
      ),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [hasRail]);
  return (
    <div className={`frame-layout ${rail ? '' : 'solo'}`}>
      <div className="frame-main">{children}</div>
      {rail && (
        <div ref={railBox} className="frame-rail">
          {rail}
        </div>
      )}
    </div>
  );
}
