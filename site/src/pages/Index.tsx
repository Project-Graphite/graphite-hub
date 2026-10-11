import { Link } from 'react-router';
import ChangelogPreview from '../components/ChangelogPreview';
import EpicCard from '../components/EpicCard';
import MemberCard from '../components/MemberCard';
import ProjectCard from '../components/ProjectCard';
import Section from '../components/Section';
import { childProjects, epics, members, rootProjects } from '../registry';

export default function Index() {
  return (
    <>
      <div className="grid gap-10 pt-22 pb-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <section>
          <p className="mono-sm m-0 mb-4 text-faint">members / epics / projects</p>
          <h1 className="page-title">
            Project Graphite
          </h1>
          <div className="hero-rule mt-5.5 max-w-[52ch]" />
          <p className="mt-5.5 mb-0 max-w-[52ch] text-muted">
            A shared portfolio for the members behind Project Graphite. Every standalone project has
            its own repository; deployable web projects get a live subdomain, while source-only work
            is labelled as such.
          </p>
        </section>
        <ChangelogPreview />
      </div>

      <Section
        label="members"
        action={
          <Link to="/members" className="rule-link mono-sm">
            view all
          </Link>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {members.slice(0, 4).map((member) => (
            <MemberCard key={member.handle} member={member} />
          ))}
        </div>
      </Section>

      {epics.length > 0 && (
        <Section
          label="epics"
          action={
            <Link to="/epics" className="rule-link mono-sm">
              view all
            </Link>
          }
        >
          <div className="grid gap-5">
            {epics.slice(0, 2).map((epic) => (
              <EpicCard key={epic.path} epic={epic} projects={childProjects(epic.slug)} />
            ))}
          </div>
        </Section>
      )}

      {rootProjects.length > 0 && (
        <Section
          label="projects"
          action={
            <Link to="/projects" className="rule-link mono-sm">
              view all
            </Link>
          }
        >
          <div className="grid gap-4 md:grid-cols-2">
            {[...rootProjects]
              .sort((a, b) => Number(b.status === 'live') - Number(a.status === 'live'))
              .slice(0, 4)
              .map((project) => (
                <ProjectCard key={project.path} project={project} />
              ))}
          </div>
        </Section>
      )}
    </>
  );
}
