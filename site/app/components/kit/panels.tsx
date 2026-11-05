import { Link } from 'react-router';
import { day, shortTag } from '../../format';
import { changelogPath } from '../../model';
import type { ConsoleLine, Member, Project, Release, Running } from '../../types';
import Status from '../Status';
import { Avatar, Panel } from './basics';
import { Console } from './live';

export function MembersPanel({
  members,
  projectsOf,
}: {
  members: Member[];
  projectsOf: (member: Member) => number;
}) {
  return (
    <Panel title="members" link={{ to: '/members', label: 'view all' }}>
      <div className="panel-list">
        {members.map((member) => (
          <Link key={member.handle} to={member.path}>
            <Avatar member={member} size="md" />
            <span>
              <strong>{member.name}</strong>
              <span className="headline">{member.headline ?? `@${member.github}`}</span>
            </span>
            <span className="count">{projectsOf(member)}</span>
          </Link>
        ))}
      </div>
    </Panel>
  );
}

export function RunningPanel({ running }: { running: Running[] }) {
  return (
    <Panel title="running now" link={{ to: '/status', label: 'status' }}>
      <div className="running">
        {running.map((project) => (
          <div key={project.slug} className="row">
            <Link to={project.path} className="font-semibold hover:underline">
              {project.name}
            </Link>
            <Status status="live" />
            <span className="meta">
              {project.deploy
                ? `sha-${shortTag(project.deploy.tag)} · ${day(project.deploy.at)}`
                : 'no deploy recorded yet'}
              <span className="week">
                {project.week.map((state, index) => (
                  <i
                    key={index}
                    className={state === 'none' ? '' : state}
                    style={{ animationDelay: `${index * 60}ms` }}
                  />
                ))}
              </span>
            </span>
          </div>
        ))}
      </div>
      <p className="mono-sm mt-3.5 text-faint">dots: the last seven days, green when up all day</p>
    </Panel>
  );
}

export function ConsolePanel({ lines, limit }: { lines: ConsoleLine[]; limit: number }) {
  return (
    <Panel title="live console" link={{ to: '/status', label: 'status' }}>
      <Console initial={lines} limit={limit} />
    </Panel>
  );
}

export function ChangelogPanel({
  releases,
  projectOf,
}: {
  releases: Release[];
  projectOf: (release: Release) => Project | undefined;
}) {
  return (
    <Panel title="changelog" link={{ to: '/changelog', label: 'full log' }}>
      <ol className="releases">
        {releases.map((release) => {
          const project = projectOf(release);
          return (
            <li key={release.id}>
              <Link to={project ? `${changelogPath(project)}#${release.id}` : '/changelog'}>
                <span className="project">{project?.name ?? release.project}</span>
                <span className="version">
                  <strong>v{release.version}</strong>
                  <time dateTime={release.date}>{release.date}</time>
                </span>
                <span className="line">
                  {release.title ?? release.summary ?? release.groups[0]?.changes[0]?.text}
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </Panel>
  );
}
