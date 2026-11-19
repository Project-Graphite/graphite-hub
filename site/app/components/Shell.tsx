import { useEffect, useRef, type ReactNode, type RefObject } from 'react';
import { Link, NavLink, useLocation } from 'react-router';
import { useRoot } from '../hub';
import { Backdrop } from '../motion/canvases';
import { MotionContext } from '../motion/motion';
import { defaults, visible, type NAV } from '../settings';
import AccountMenu from './AccountMenu';
import { Editable, useEditing } from './kit/Editable';
import { LivePulse } from './kit/live';
import { openSearch, Palette } from './kit/Palette';
import { SubscribeForm, SubscribeLink } from './kit/subscribe';

const NAV_TARGET: Record<(typeof NAV)[number], { to: string; label: string }> = {
  members: { to: '/members', label: 'members' },
  epics: { to: '/epics', label: 'epics' },
  projects: { to: '/projects', label: 'projects' },
  blog: { to: '/blog', label: 'blog' },
  changelog: { to: '/changelog', label: 'changelog' },
  messages: { to: '/messages', label: 'messages' },
  status: { to: '/status', label: 'status' },
  github: { to: 'https://github.com/project-graphite', label: 'github ↗' },
};

export default function Shell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const root = useRoot();
  const settings = root?.settings ?? defaults();
  const editing = useEditing();

  return (
    <MotionContext value={settings['site.motion']}>
      <Backdrop />
      <a href="#content" className="skip-link">
        skip to content
      </a>
      <header className="frame-header">
        <div className="shell">
          <Link
            to="/"
            className="flex items-center gap-2.5 text-[1.02rem] font-[620] tracking-[-0.022em] text-ink"
          >
            <svg
              aria-hidden="true"
              className="h-[1.15em] w-[0.9em] shrink-0"
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
          <nav aria-label="Primary" className="frame-nav">
            {visible(settings['site.nav']).map((id) => {
              const { to, label } = NAV_TARGET[id as keyof typeof NAV_TARGET];
              return to.startsWith('http') ? (
                <a key={id} href={to}>
                  {label}
                </a>
              ) : (
                <NavLink key={id} to={to}>
                  {label}
                </NavLink>
              );
            })}
            <button type="button" className="frame-search" onClick={openSearch}>
              search
              <span className="kbd">/</span>
            </button>
            {root && <LivePulse />}
            <AccountMenu />
          </nav>
        </div>
      </header>

      <main id="content" className="shell pb-12">
        <div key={pathname} className="page-transition">
          {children}
        </div>
      </main>

      <footer className="frame-footer">
        <div className="shell footer-grid">
          <div className="footer-subscribe">
            <span className="footer-lead">new writing, by email</span>
            <SubscribeForm scope={{ kind: 'all' }} cadence="each" compact />
            <SubscribeLink />
          </div>
          <div className="footer-line">
            <Editable setting="site.footer" />
            <Link to="/privacy" className="hover:text-ink">
              privacy
            </Link>
          </div>
        </div>
      </footer>
      <Palette />
      {editing && (
        <div className="edit-bar mono-sm">
          <span>editing the page</span>
          <Link to={pathname}>done</Link>
        </div>
      )}
    </MotionContext>
  );
}

const RAIL_GAP = 24;

function useTwoWayRail(box: RefObject<HTMLDivElement | null>, hasRail: boolean) {
  useEffect(() => {
    const layout = box.current;
    const content = layout?.querySelector<HTMLElement>(':scope > .frame-main');
    const rail = layout?.querySelector<HTMLElement>(':scope > .frame-rail');
    if (!layout || !content || !rail || !hasRail) {
      return;
    }
    let last = scrollY;
    let down = false;
    let offset = 0;
    const place = () => {
      if (getComputedStyle(rail).position === 'static') {
        rail.style.transform = '';
        return;
      }
      const y = scrollY;
      if (y !== last) {
        down = y > last;
      }
      last = y;
      const top = rail.getBoundingClientRect().top - offset;
      const height = rail.offsetHeight;
      const room = innerHeight - RAIL_GAP * 2;
      let visual = top + offset;
      if (height <= room) {
        visual = RAIL_GAP;
      } else if (down) {
        visual = Math.max(visual, innerHeight - RAIL_GAP - height);
      } else {
        visual = Math.min(visual, RAIL_GAP);
      }
      offset = Math.min(Math.max(visual - top, 0), Math.max(content.offsetHeight - height, 0));
      rail.style.transform = offset ? `translateY(${offset}px)` : '';
    };
    const observer = new ResizeObserver(place);
    observer.observe(rail);
    observer.observe(content);
    addEventListener('scroll', place, { passive: true });
    addEventListener('resize', place);
    place();
    return () => {
      observer.disconnect();
      removeEventListener('scroll', place);
      removeEventListener('resize', place);
      rail.style.transform = '';
    };
  }, [box, hasRail]);
}

export function Page({ rail, children }: { rail?: ReactNode; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  useTwoWayRail(box, Boolean(rail));
  return (
    <div ref={box} className={`frame-layout ${rail ? '' : 'solo'}`}>
      <div className="frame-main">{children}</div>
      {rail && <div className="frame-rail">{rail}</div>}
    </div>
  );
}
