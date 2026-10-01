import { useEffect, useRef } from 'react';
import { Link, Outlet, useLocation } from 'react-router';
import { metaFor } from '../meta';

export default function Shell() {
  const { pathname, hash } = useLocation();
  const previousPathname = useRef(pathname);

  useEffect(() => {
    if (pathname !== previousPathname.current) {
      const target = hash ? document.getElementById(hash.slice(1)) : null;
      if (target) {
        target.scrollIntoView({ behavior: 'instant' });
      } else {
        window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      }
      document.title = metaFor(pathname.replace(/(.)\/$/, '$1')).title;
      previousPathname.current = pathname;
    }
  }, [pathname, hash]);

  return (
    <div className="flex min-h-screen flex-col">
      <a href="#content" className="skip-link">
        skip to content
      </a>
      <header className="sticky top-0 z-10 border-b border-line-soft bg-paper/88 backdrop-blur-sm">
        <div className="shell flex flex-wrap items-center justify-between gap-4 py-4.5">
          <Link
            to="/"
            className="flex items-center gap-2.5 text-[1.02rem] font-[620] tracking-[-0.022em] text-ink no-underline"
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
            Project Graphite
          </Link>
          <nav aria-label="Primary" className="mono-sm flex flex-wrap gap-x-5 gap-y-2">
            <Link
              to="/members"
              className="text-muted no-underline transition-colors duration-200 hover:text-ink"
            >
              members
            </Link>
            <Link
              to="/epics"
              className="text-muted no-underline transition-colors duration-200 hover:text-ink"
            >
              epics
            </Link>
            <Link
              to="/projects"
              className="text-muted no-underline transition-colors duration-200 hover:text-ink"
            >
              projects
            </Link>
            <Link
              to="/changelog"
              className="text-muted no-underline transition-colors duration-200 hover:text-ink"
            >
              changelog
            </Link>
            <a
              href="https://github.com/project-graphite"
              className="text-muted no-underline transition-colors duration-200 hover:text-ink"
            >
              github ↗
            </a>
          </nav>
        </div>
      </header>

      <main id="content" className="shell flex-1 pb-12">
        <div key={pathname} className="page-transition">
          <Outlet />
        </div>
      </main>

      <footer className="shell mono-sm mt-24 border-t border-line-soft pt-7 pb-14 text-faint text-center">
        <p className="m-0">
          Project Graphite · Made for Learning · Made for Fun · Made for Everyone
        </p>
      </footer>
    </div>
  );
}
