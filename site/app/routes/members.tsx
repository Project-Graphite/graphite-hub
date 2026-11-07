import { useCallback, useState, type CSSProperties } from 'react';
import { Link } from 'react-router';
import type { Route } from './+types/members';
import { accentStyle, Avatar, Band } from '../components/kit/basics';
import { Fact, loadRail, PageHeader, StandardRail } from '../components/kit/page';
import { Page } from '../components/Shell';
import TagList from '../components/TagList';
import { hubContext } from '../context';
import { useHub } from '../hub';
import { useOnline } from '../live';
import { useSpotlight, useTilt } from '../motion/motion';
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
  index,
  online,
}: {
  member: Member;
  projects: number;
  releases: number;
  index: number;
  online: boolean;
}) {
  const tilt = useTilt<HTMLElement>();
  const spot = useSpotlight<HTMLElement>();
  const pointer = useCallback(
    (element: HTMLElement | null) => {
      tilt(element);
      spot(element);
    },
    [tilt, spot],
  );
  const stack = member.stack.flatMap((group) => group.items).slice(0, 8);
  return (
    <article
      ref={pointer}
      className="member spot tilt"
      style={{ ...accentStyle(member.accent), '--i': index } as CSSProperties}
    >
      <div className="sky">
        {member.coverUrl && <img src={member.coverUrl} alt="" loading="lazy" />}
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
            <b>{projects}</b> {projects === 1 ? 'project' : 'projects'}
          </span>
          <span>
            <b>{releases}</b> {releases === 1 ? 'release' : 'releases'}
          </span>
          {member.followers !== null && (
            <span>
              <b>{member.followers}</b> followers
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
            <Fact value={hub.members.length} label="members" />
            <Fact value={hub.rootProjects.length} label="projects" />
            <Fact value={hub.epics.length} label={hub.epics.length === 1 ? 'epic' : 'epics'} />
            <Fact value={hub.releases.length} label="releases" />
          </>
        }
      />
      <section className="band dir">
        <div className="roster">
          {hub.members.map((member, index) => (
            <Card
              key={member.handle}
              member={member}
              projects={creditsOf(member).length}
              releases={releasesOf(member)}
              index={index}
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
                          aria-label={`${member.name} · ${project.name}`}
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
