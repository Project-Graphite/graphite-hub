import { Link, Outlet } from 'react-router-dom';
import ThemeToggle from './ThemeToggle';

export default function Shell() {
  return (
    <>
      <a href="#content" className="skip-link">
        skip to content
      </a>
      <header className="sticky top-0 z-10 border-b border-line-soft bg-paper/88 backdrop-blur-[8px]">
        <div className="shell flex flex-wrap items-baseline justify-between gap-4 py-[18px]">
          <Link
            to="/"
            className="text-[1.02rem] font-[620] tracking-[-0.022em] text-ink no-underline"
          >
            Project Graphite
          </Link>
          <nav aria-label="Primary" className="mono-sm flex flex-wrap gap-x-5 gap-y-2">
            <a href="/#people" className="text-muted no-underline hover:text-ink">
              members
            </a>
            <a href="/#projects" className="text-muted no-underline hover:text-ink">
              projects
            </a>
            <a
              href="https://github.com/project-graphite"
              className="text-muted no-underline hover:text-ink"
            >
              github ↗
            </a>
            <ThemeToggle />
          </nav>
        </div>
      </header>

      <main id="content" className="shell">
        <Outlet />
      </main>

      <footer className="shell mono-sm mt-24 border-t border-line-soft pt-7 pb-14 text-faint">
        <p className="m-0">People, projects and deployment state — compiled from one registry.</p>
      </footer>
    </>
  );
}
