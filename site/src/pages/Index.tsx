import ProjectCard from '../components/ProjectCard';
import { people, projects } from '../registry';
import { Link } from 'react-router-dom';

export const meta = {
  title: 'Project Graphite',
  description:
    'Projects built and deployed under one roof, each with its own repository, subdomain and running deployment.',
};

export default function Index() {
  return (
    <>
      <section className="pt-[88px] pb-5">
        <h1 className="m-0 max-w-[15ch] text-[clamp(2rem,5.2vw,3.1rem)] leading-[1.08] font-[640] tracking-[-0.038em]">
          Things that get built here, and stay built.
        </h1>
        <p className="mt-[22px] mb-0 max-w-[52ch] text-muted">
          Every project has its own repository, its own subdomain and a real deployment. The diagram
          on each card is generated from what is actually running, not drawn by hand.
        </p>
      </section>

      {people.length > 0 && (
        <nav className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line-soft pt-7 font-mono text-[0.82em]">
          <span className="text-faint">people</span>
          {people.map((person) => (
            <Link key={person.handle} to={person.path} className="text-muted hover:text-ink">
              /{person.handle}
            </Link>
          ))}
        </nav>
      )}

      {projects.length === 0 ? (
        <p className="mt-10 border-t border-line-soft pt-16 font-mono text-[0.82em] text-faint">
          Nothing registered yet.
        </p>
      ) : (
        <div className="mt-4">
          {projects.map((project) => (
            <ProjectCard key={project.path} project={project} />
          ))}
        </div>
      )}
    </>
  );
}
