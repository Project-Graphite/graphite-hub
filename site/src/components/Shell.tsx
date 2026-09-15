import { Link, Outlet } from 'react-router-dom';

export default function Shell() {
  return (
    <>
      <header className="sticky top-0 z-10 border-b border-line-soft bg-paper/88 backdrop-blur-[8px]">
        <div className="shell flex items-baseline justify-between gap-4 py-[18px]">
          <Link
            to="/"
            className="text-[1.02rem] font-[620] tracking-[-0.022em] text-ink no-underline"
          >
            Project Graphite
          </Link>
          <a
            href="https://github.com/project-graphite"
            className="mono-sm text-muted no-underline hover:text-ink"
          >
            github ↗
          </a>
        </div>
      </header>

      <main className="shell">
        <Outlet />
      </main>

      <footer className="shell mono-sm mt-24 border-t border-line-soft pt-7 pb-14 text-faint">
        <p className="m-0">People, projects and deployment state — compiled from one registry.</p>
      </footer>
    </>
  );
}
