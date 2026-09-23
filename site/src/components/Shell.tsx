import { useEffect, useRef } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { metaFor } from '../meta';

export default function Shell() {
  const { pathname } = useLocation();
  const previousPathname = useRef(pathname);

  useEffect(() => {
    if (pathname !== previousPathname.current) {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      document.title = metaFor(pathname.replace(/(.)\/$/, '$1')).title;
      previousPathname.current = pathname;
    }
  }, [pathname]);

  return (
    <div className="flex min-h-screen flex-col">
      <a href="#content" className="skip-link">
        skip to content
      </a>
      <header className="sticky top-0 z-10 border-b border-line-soft bg-paper/88 backdrop-blur-sm">
        <div className="shell flex flex-wrap items-baseline justify-between gap-4 py-4.5">
          <Link
            to="/"
            className="text-[1.02rem] font-[620] tracking-[-0.022em] text-ink no-underline"
          >
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
