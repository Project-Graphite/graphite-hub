import { Link } from 'react-router-dom';
import EpicCard from '../components/EpicCard';
import MemberCard from '../components/MemberCard';
import ProjectCard from '../components/ProjectCard';
import Section from '../components/Section';
import { childProjects, epics, members, rootProjects } from '../registry';

const MEMBER_PREVIEW = 4;
const EPIC_PREVIEW = 2;
const PROJECT_PREVIEW = 4;

export default function Index() {
  return (
    <>
      <section className="pt-22 pb-5">
        <p className="mono-sm m-0 mb-4 text-faint">members / epics / projects</p>
        <h1 className="page-title">
          Project Graphite · Made for Learning · Made for Fun · Made for Everyone
        </h1>
        <div className="hero-rule mt-5.5 max-w-[52ch]" />
        <p className="mt-5.5 mb-0 max-w-[52ch] text-muted">
          A shared portfolio for the members behind Project Graphite. Every project has its own
          repository; deployable web projects get a live subdomain, while source-only work is
          labelled honestly.
        </p>
      </section>

      {members.length > 0 && (
        <Section
          label="members"
          action={
            <Link to="/members" className="rule-link mono-sm">
              view all
            </Link>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2">
            {members.slice(0, MEMBER_PREVIEW).map((member) => (
              <MemberCard key={member.handle} member={member} />
            ))}
          </div>
        </Section>
      )}

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
            {epics.slice(0, EPIC_PREVIEW).map((epic) => (
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
            {rootProjects.slice(0, PROJECT_PREVIEW).map((project) => (
              <ProjectCard key={project.path} project={project} />
            ))}
          </div>
        </Section>
      )}
    </>
  );
}
