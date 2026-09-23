import ProjectCard from '../components/ProjectCard';
import Section from '../components/Section';
import { rootProjects } from '../registry';

export default function Projects() {
  return (
    <>
      <section className="pt-22 pb-5">
        <p className="mono-sm m-0 mb-3 text-faint">/projects</p>
        <h1 className="page-title max-w-[20ch]">Projects</h1>
        <p className="mt-5.5 mb-0 max-w-[52ch] text-muted">
          Standalone projects — each with its own repository, independent of any epic.
        </p>
      </section>

      <Section label="standalone projects">
        {rootProjects.length === 0 ? (
          <p className="mono-sm m-0 text-faint">Nothing registered yet.</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {rootProjects.map((project) => (
              <ProjectCard key={project.path} project={project} />
            ))}
          </div>
        )}
      </Section>
    </>
  );
}
