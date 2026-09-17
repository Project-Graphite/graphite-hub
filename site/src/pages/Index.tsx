import { Link } from 'react-router-dom';
import ProjectCard from '../components/ProjectCard';
import Section from '../components/Section';
import { epics, githubProfiles, people, rootProjects } from '../registry';

export default function Index() {
  return (
    <>
      <section className="pt-22 pb-5">
        <p className="mono-sm m-0 mb-4 text-faint">people / projects / working software</p>
        <h1 className="page-title max-w-[20ch]">Things that get built here, and stay built.</h1>
        <p className="mt-5.5 mb-0 max-w-[52ch] text-muted">
          A shared portfolio for the people behind Project Graphite. Every project has its own
          repository; deployable web projects get a live subdomain, while source-only work is
          labelled honestly.
        </p>
        <div className="mono-sm mt-7 flex flex-wrap gap-5">
          <a href="#projects" className="rule-link">
            explore projects ↓
          </a>
          <a href="#people" className="rule-link">
            meet the members ↓
          </a>
        </div>
      </section>

      {people.length > 0 && (
        <Section id="people" label="people">
          <div className="grid gap-4 sm:grid-cols-2">
            {people.map((person) => {
              const profile = githubProfiles[person.github];
              return (
                <Link
                  key={person.handle}
                  to={person.path}
                  className="flex items-center gap-4 rounded-lg border border-line-soft bg-surface p-4 text-ink no-underline hover:border-line"
                >
                  <img
                    src={
                      profile?.avatarUrl ??
                      `https://github.com/${encodeURIComponent(person.github)}.png?size=96`
                    }
                    alt=""
                    width={48}
                    height={48}
                    loading="lazy"
                    className="size-12 rounded-full border border-line-soft"
                  />
                  <span>
                    <strong className="block font-semibold">{person.name}</strong>
                    <span className="mt-1 block text-sm text-muted">
                      {person.headline ?? `@${person.github}`}
                    </span>
                  </span>
                </Link>
              );
            })}
          </div>
        </Section>
      )}

      <Section id="projects" label="projects">
        {rootProjects.length === 0 ? (
          <p className="mono-sm m-0 text-faint">Nothing registered yet.</p>
        ) : (
          <div>
            {rootProjects.map((project) => (
              <ProjectCard key={project.path} project={project} />
            ))}
          </div>
        )}
      </Section>

      {epics.length > 0 && (
        <Section id="epics" label="epics">
          <div>
            {epics.map((epic) => (
              <ProjectCard key={epic.path} project={epic} />
            ))}
          </div>
        </Section>
      )}
    </>
  );
}
