import { useState } from 'react';
import { Link } from 'react-router';
import type { Route } from './+types/members';
import { accentStyle, Avatar, Band } from '../components/kit/basics';
import { Fact, loadRail, PageHeader, StandardRail } from '../components/kit/page';
import { Page } from '../components/Shell';
import TagList from '../components/TagList';
import { hubContext } from '../context';
import { plural } from '../format';
import { useHub } from '../hub';
import { useOnline } from '../live';
import { useSpotlight } from '../motion/motion';
import { topicsFor } from '../topics';
import type { Member } from '../types';

export const handle = topicsFor('members');

export function loader({ context }: Route.LoaderArgs) {
  return loadRail(context.get(hubContext));
}

function Card({
  member,
  projects,
  releases,
  online,
}: {
  member: Member;
  projects: number;
  releases: number;
  online: boolean;
}) {
  const spot = useSpotlight<HTMLElement>();
  const stack = member.stack.flatMap((group) => group.items).slice(0, 8);
  return (
    <article ref={spot} className="member-card spot" style={accentStyle(member.accent)}>
      <div className="banner">
        {member.coverUrl && (
          <img
            src={member.coverUrl}
            alt=""
            width={640}
            height={176}
            loading="lazy"
            decoding="async"
          />
        )}
      </div>
      <Link to={member.path} className="face" tabIndex={-1} aria-hidden="true">
        <Avatar member={member} size="lg" online={online} />
      </Link>
      <div className="body">
        <h3>
          <Link to={member.path}>{member.name}</Link>
        </h3>
        <p className="headline">{member.headline ?? `@${member.github}`}</p>
        {member.bio && <p className="bio">{member.bio}</p>}
        <div className="facts">
          <span>
            <b>{projects}</b> {plural(projects, 'project')}
          </span>
          <span>
            <b>{releases}</b> {plural(releases, 'release')}
          </span>
          {member.followers !== null && (
            <span>
              <b>{member.followers}</b> {plural(member.followers, 'follower')}
            </span>
          )}
          {member.joined && (
            <span>
              since <b>{member.joined}</b>
            </span>
          )}
        </div>
        {stack.length > 0 && <TagList tags={stack} />}
        <div className="links">
          {member.links.map((link) => (
            <a key={link.url} href={link.url} className="rule-link">
              {link.label}
            </a>
          ))}
        </div>
      </div>
    </article>
  );
}

export default function Members({ loaderData }: Route.ComponentProps) {
  const hub = useHub();
  const [column, setColumn] = useState<string | null>(null);
  const creditsOf = (member: Member) => [
    ...hub.projectsForMember(member),
    ...hub.epicsForMember(member),
  ];
  const releasesOf = (member: Member) =>
    new Set(
      creditsOf(member).flatMap((project) => hub.releasesForProject(project).map((r) => r.id)),
    ).size;
  const columns = hub.projects.filter((project) =>
    hub.members.some((member) => hub.isCredited(project, member)),
  );
  const online = useOnline();
  return (
    <Page rail={<StandardRail {...loaderData} />}>
      <PageHeader
        path="/members"
        title="Members"
        facts={
          <>
            <Fact value={hub.members.length} label={plural(hub.members.length, 'member')} />
            <Fact
              value={hub.rootProjects.length}
              label={plural(hub.rootProjects.length, 'project')}
            />
            <Fact value={hub.epics.length} label={plural(hub.epics.length, 'epic')} />
            <Fact value={hub.releases.length} label={plural(hub.releases.length, 'release')} />
          </>
        }
      />
      <section className="band dir">
        <div className="roster">
          {hub.members.map((member) => (
            <Card
              key={member.handle}
              member={member}
              projects={creditsOf(member).length}
              releases={releasesOf(member)}
              online={online.has(member.handle)}
            />
          ))}
        </div>
      </section>
      <Band title="Who built what">
        <div className="credits" onPointerLeave={() => setColumn(null)}>
          <table>
            <thead>
              <tr>
                <th />
                {columns.map((project) => (
                  <th
                    key={project.path}
                    scope="col"
                    data-lit={column === project.path || undefined}
                    onPointerEnter={() => setColumn(project.path)}
                  >
                    <Link to={project.path}>{project.name}</Link>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {hub.members.map((member) => (
                <tr key={member.handle} style={accentStyle(member.accent)}>
                  <th scope="row">
                    <Link to={member.path}>
                      <Avatar member={member} size="xs" />
                      {member.name}
                    </Link>
                  </th>
                  {columns.map((project) => (
                    <td
                      key={project.path}
                      data-lit={column === project.path || undefined}
                      onPointerEnter={() => setColumn(project.path)}
                    >
                      {hub.isCredited(project, member) ? (
                        <Link
                          to={project.path}
                          className="dot"
                          aria-label={`${member.name} on ${project.name}`}
                        />
                      ) : (
                        <i />
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Band>
    </Page>
  );
}
