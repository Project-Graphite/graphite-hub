import { accentStyle, Avatar } from '../components/kit/basics';
import { ChangelogPanel, RunningPanel } from '../components/kit/panels';
import { Page } from '../components/Shell';
import { hubContext } from '../context';
import { Fragment } from 'react';
import type { Route } from './+types/member';
import EpicCard from '../components/EpicCard';
import ProjectCard from '../components/ProjectCard';
import Section from '../components/Section';
import TagList from '../components/TagList';
import { found, modelFrom, useHub } from '../hub';

export const handle = { topics: ['deploys', 'releases', 'projects', 'uptime'] };

export function loader({ context, params }: Route.LoaderArgs) {
  const model = modelFrom(context);
  const member = found(model.memberByHandle(params.handle));
  const { reads, directory } = context.get(hubContext);
  const owned = new Set(model.projectsOwnedBy(member).map((project) => project.slug));
  return {
    handle: member.handle,
    running: reads.running(directory).filter((running) => owned.has(running.slug)),
  };
}

export default function Member({ loaderData }: Route.ComponentProps) {
  const {
    childProjects,
    contributionForMember,
    epicsForMember,
    memberByHandle,
    projectBySlug,
    projectsForMember,
    releasesOwnedBy,
  } = useHub();
  const member = memberByHandle(loaderData.handle)!;

  const memberProjects = projectsForMember(member);
  const memberEpics = epicsForMember(member);

  const releases = releasesOwnedBy(member);

  return (
    <Page
      rail={
        <>
          {releases.length > 0 && (
            <ChangelogPanel
              releases={releases.slice(0, 4)}
              projectOf={(release) => projectBySlug(release.project)}
            />
          )}
          {loaderData.running.length > 0 && <RunningPanel running={loaderData.running} />}
        </>
      }
    >
      <section className="page-hero" style={accentStyle(member.accent)}>
        <p className="mono-sm m-0 text-faint">/members/{member.handle}</p>

        <div className="mt-3 flex items-center gap-5">
          <Avatar member={member} size="lg" />
          <div>
            <h1 className="page-title max-w-[18ch]">{member.name}</h1>
            {member.headline && <p className="mt-2 mb-0 text-muted">{member.headline}</p>}
          </div>
        </div>

        {member.bio && <p className="mt-6 mb-0 max-w-[56ch] text-muted">{member.bio}</p>}

        {member.links.length > 0 && (
          <div className="mono-sm mt-6 flex flex-wrap gap-x-4.5 gap-y-2">
            {member.links.map((link) => (
              <a key={link.url} href={link.url} className="rule-link">
                {link.label} ↗
              </a>
            ))}
          </div>
        )}
      </section>

      <Section label="on github">
        <dl className="mono-sm grid grid-cols-[auto_minmax(0,1fr)] gap-x-8 gap-y-3">
          <dt className="text-faint">public repositories</dt>
          <dd className="m-0">{member.publicRepos ?? '—'}</dd>

          <dt className="text-faint">followers</dt>
          <dd className="m-0">{member.followers ?? '—'}</dd>

          <dt className="text-faint">since</dt>
          <dd className="m-0">{member.joined ?? '—'}</dd>

          <dt className="text-faint">profile</dt>
          <dd className="m-0">
            <a href={`https://github.com/${member.github}`} className="text-ink hover:underline">
              github.com/{member.github} ↗
            </a>
          </dd>
        </dl>
      </Section>

      {member.stack.length > 0 && (
        <Section label="stack">
          <dl className="mono-sm grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-8 gap-y-3">
            {member.stack.map((group) => (
              <Fragment key={group.group}>
                <dt className="text-faint">{group.group}</dt>
                <dd className="m-0">
                  <TagList tags={group.items} />
                </dd>
              </Fragment>
            ))}
          </dl>
        </Section>
      )}

      <Section label="projects">
        {memberProjects.length === 0 ? (
          <p className="mono-sm m-0 text-faint">No projects credited to this member yet.</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {memberProjects.map((project) => (
              <ProjectCard
                key={project.path}
                project={project}
                context={contributionForMember(project, member)?.summary}
              />
            ))}
          </div>
        )}
      </Section>

      {memberEpics.length > 0 && (
        <Section label="epics">
          <div className="grid gap-5">
            {memberEpics.map((epic) => (
              <EpicCard
                key={epic.path}
                epic={epic}
                projects={childProjects(epic.slug)}
                context={contributionForMember(epic, member)?.summary}
              />
            ))}
          </div>
        </Section>
      )}
    </Page>
  );
}
