import ProjectCard from './components/ProjectCard';
import data from './data/projects.json';
import type { Project } from './types';

const projects = data as Project[];

export default function App() {
  return (
    <>
      <header className="sticky top-0 z-10 border-b border-line-soft bg-paper/88 backdrop-blur-[8px]">
        <div className="shell flex items-baseline justify-between gap-4 py-[18px]">
          <a
            href="/"
            className="text-[1.02rem] font-[620] tracking-[-0.022em] no-underline text-ink"
          >
            Project Graphite
          </a>
          <a
            href="https://github.com/project-graphite"
            className="font-mono text-[0.82em] text-muted no-underline hover:text-ink"
          >
            github ↗
          </a>
        </div>
      </header>

      <main className="shell">
        <section className="pt-[88px] pb-5">
          <h1 className="m-0 max-w-[15ch] text-[clamp(2rem,5.2vw,3.1rem)] leading-[1.08] font-[640] tracking-[-0.038em]">
            Things that get built here, and stay built.
          </h1>
          <p className="mt-[22px] mb-0 max-w-[52ch] text-muted">
            Every project has its own repository, its own subdomain and a real deployment. The
            diagram on each card is generated from what is actually running, not drawn by hand.
          </p>
        </section>

        {projects.length === 0 ? (
          <p className="mt-10 border-t border-line-soft pt-16 font-mono text-[0.82em] text-faint">
            Nothing registered yet.
          </p>
        ) : (
          <div>
            {projects.map((project) => (
              <ProjectCard key={project.slug} project={project} />
            ))}
          </div>
        )}
      </main>

      <footer className="shell mt-24 border-t border-line-soft pt-7 pb-14 font-mono text-[0.82em] text-faint">
        <p className="m-0">Every project here is registered, built and deployed from one place.</p>
      </footer>
    </>
  );
}
