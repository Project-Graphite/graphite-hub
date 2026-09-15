import { Link } from 'react-router-dom';
import ProjectCard from '../components/ProjectCard';
import Section from '../components/Section';
import { people, projects } from '../registry';

export default function Index() {
  return (
    <>
      <section className="pt-[88px] pb-5">
        <h1 className="page-title max-w-[20ch]">Things that get built here, and stay built.</h1>
        <p className="mt-[22px] mb-0 max-w-[52ch] text-muted">
          Every project has its own repository, its own subdomain and a real deployment. The page
          for each one is generated from the entry that creates that deployment, so it cannot drift
          from what is actually running.
        </p>
      </section>

      {people.length > 0 && (
        <Section label="people">
          <div className="mono-sm flex flex-wrap gap-x-5 gap-y-2">
            {people.map((person) => (
              <Link key={person.handle} to={person.path} className="text-muted hover:text-ink">
                /{person.handle}
              </Link>
            ))}
          </div>
        </Section>
      )}

      <Section label="projects">
        {projects.length === 0 ? (
          <p className="mono-sm m-0 text-faint">Nothing registered yet.</p>
        ) : (
          <div>
            {projects.map((project) => (
              <ProjectCard key={project.path} project={project} />
            ))}
          </div>
        )}
      </Section>
    </>
  );
}
