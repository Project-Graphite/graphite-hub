import type { ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router';
import { useRoot } from '../hub';
import { MotionContext } from '../motion/motion';
import { defaults, visible, type NAV } from '../settings';
import { accentStyle } from './kit/basics';
import { Editable, useEditing } from './kit/Editable';
import { Palette } from './kit/Palette';

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
  const viewerAccent = root?.directory.members.find(
    (member) => member.github.toLowerCase() === root.viewer?.login.toLowerCase(),
  )?.accent;

  return (
    <MotionContext value={settings['site.motion']}>
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
            {root?.viewer ? (
              <form method="post" action="/auth/sign-out" className="flex items-center gap-2.5">
                <input type="hidden" name="csrf" value={root.csrf ?? ''} />
                <span className="avatar xs" style={accentStyle(viewerAccent)}>
                  <img
                    src={root.viewer.avatarUrl}
                    alt={`Signed in as ${root.viewer.login}`}
                    width={20}
                    height={20}
                  />
                </span>
                <button
                  type="submit"
                  className="cursor-pointer border-0 bg-transparent p-0 font-mono"
                >
                  sign out
                </button>
              </form>
            ) : (
              root?.signIn && (
                <a href={`/auth/sign-in?return=${encodeURIComponent(pathname)}`}>sign in</a>
              )
            )}
          </nav>
        </div>
      </header>

      <main id="content" className="shell pb-12">
        <div key={pathname} className="page-transition">
          {children}
        </div>
      </main>

      <footer className="frame-footer">
        <div className="shell flex flex-wrap justify-between gap-4">
          <Editable setting="site.footer" />
          <Link to="/privacy" className="hover:text-ink">
            privacy
          </Link>
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

export function Page({ rail, children }: { rail?: ReactNode; children: ReactNode }) {
  return (
    <div className={`frame-layout ${rail ? '' : 'solo'}`}>
      <div className="frame-main">{children}</div>
      {rail && <div className="frame-rail">{rail}</div>}
    </div>
  );
}
