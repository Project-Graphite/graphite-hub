import { Fragment } from 'react';
import type { Route } from './+types/member';
import EpicCard from '../components/EpicCard';
import ProjectCard from '../components/ProjectCard';
import Section from '../components/Section';
import TagList from '../components/TagList';
import { found, modelFrom, useHub } from '../hub';

export function loader({ context, params }: Route.LoaderArgs) {
  return { handle: found(modelFrom(context).memberByHandle(params.handle)).handle };
}

export default function Member({ loaderData }: Route.ComponentProps) {
  const {
    childProjects,
    contributionForMember,
    epicsForMember,
    memberByHandle,
    projectsForMember,
  } = useHub();
  const member = memberByHandle(loaderData.handle)!;

  const memberProjects = projectsForMember(member);
  const memberEpics = epicsForMember(member);

  return (
    <>
      <section className="pt-22 pb-5">
        <p className="mono-sm m-0 text-faint">/members/{member.handle}</p>

        <div className="mt-3 flex items-center gap-5">
          <img
            src={member.avatarUrl}
            alt={`${member.name}'s GitHub avatar`}
            width={64}
            height={64}
            className="size-16 shrink-0 rounded-full border border-line-soft"
          />
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
    </>
  );
}
