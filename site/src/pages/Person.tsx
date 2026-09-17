import { Fragment } from 'react';
import { useParams } from 'react-router-dom';
import ProjectCard from '../components/ProjectCard';
import Section from '../components/Section';
import TagList from '../components/TagList';
import {
  contributionForPerson,
  epicsForPerson,
  githubProfiles,
  personByHandle,
  projectsForPerson,
} from '../registry';
import NotFound from './NotFound';

export default function Person() {
  const { handle } = useParams();
  const person = handle ? personByHandle(handle) : undefined;

  if (!person) {
    return <NotFound />;
  }

  const profile = githubProfiles[person.github];
  const memberProjects = projectsForPerson(person);
  const memberEpics = epicsForPerson(person);
  const avatarUrl =
    profile?.avatarUrl ?? `https://github.com/${encodeURIComponent(person.github)}.png?size=128`;

  return (
    <>
      <section className="pt-[88px] pb-5">
        <p className="mono-sm m-0 text-faint">/members/{person.handle}</p>

        <div className="mt-3 flex items-center gap-5">
          <img
            src={avatarUrl}
            alt={`${person.name}'s GitHub avatar`}
            width={64}
            height={64}
            className="size-16 shrink-0 rounded-full border border-line-soft"
          />
          <div>
            <h1 className="page-title max-w-[18ch]">{person.name}</h1>
            {person.headline && <p className="mt-2 mb-0 text-muted">{person.headline}</p>}
          </div>
        </div>

        {person.bio && <p className="mt-6 mb-0 max-w-[56ch] text-muted">{person.bio}</p>}

        <div className="mono-sm mt-6 flex flex-wrap gap-x-[18px] gap-y-2">
          {person.links.map((link) => (
            <a key={link.url} href={link.url} className="rule-link">
              {link.label} ↗
            </a>
          ))}
        </div>
      </section>

      <Section label="on github">
        <dl className="mono-sm grid grid-cols-[auto_minmax(0,1fr)] gap-x-8 gap-y-3">
          <dt className="text-faint">public repositories</dt>
          <dd className="m-0">{profile?.publicRepos ?? '—'}</dd>

          <dt className="text-faint">followers</dt>
          <dd className="m-0">{profile?.followers ?? '—'}</dd>

          <dt className="text-faint">since</dt>
          <dd className="m-0">{profile?.joined ?? '—'}</dd>

          <dt className="text-faint">profile</dt>
          <dd className="m-0">
            <a href={`https://github.com/${person.github}`} className="text-ink hover:underline">
              github.com/{person.github} ↗
            </a>
          </dd>
        </dl>
      </Section>

      {person.stack.length > 0 && (
        <Section label="stack">
          <dl className="mono-sm grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-8 gap-y-3">
            {person.stack.map((group) => (
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
          <div>
            {memberProjects.map((project) => (
              <ProjectCard
                key={project.path}
                project={project}
                context={contributionForPerson(project, person)?.summary}
              />
            ))}
          </div>
        )}
      </Section>

      {memberEpics.length > 0 && (
        <Section label="epics">
          <div>
            {memberEpics.map((epic) => (
              <ProjectCard
                key={epic.path}
                project={epic}
                context={contributionForPerson(epic, person)?.summary}
              />
            ))}
          </div>
        </Section>
      )}
    </>
  );
}
