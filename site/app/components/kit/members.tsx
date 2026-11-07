import type { CSSProperties } from 'react';
import { Link } from 'react-router';
import { useOnline } from '../../live';
import { useSpotlight } from '../../motion/motion';
import type { Member } from '../../types';
import { accentStyle, Avatar } from './basics';

function MemberRow({
  member,
  projects,
  online,
}: {
  member: Member;
  projects: number;
  online: boolean;
}) {
  const spot = useSpotlight<HTMLAnchorElement>();
  return (
    <Link ref={spot} to={member.path} className="spot" style={accentStyle(member.accent)}>
      <Avatar member={member} size="md" online={online} />
      <span>
        <strong>{member.name}</strong>
        <span className="headline">{member.headline ?? `@${member.github}`}</span>
      </span>
      <span className="count" aria-label={`${projects} projects`}>
        {projects}
      </span>
    </Link>
  );
}

export function People({
  members,
  projectsOf,
}: {
  members: Member[];
  projectsOf: (member: Member) => number;
}) {
  const online = useOnline();
  return (
    <div className="people">
      {members.map((member) => (
        <MemberRow
          key={member.handle}
          member={member}
          projects={projectsOf(member)}
          online={online.has(member.handle)}
        />
      ))}
    </div>
  );
}

export function Orbit({
  members,
  count,
  label,
}: {
  members: Member[];
  count: number;
  label: string;
}) {
  const online = useOnline();
  return (
    <div className="orbit">
      <div className="ring">
        {members.map((member, index) => (
          <div
            key={member.handle}
            className="orb"
            style={{ '--a': `${(index * 360) / members.length}deg` } as CSSProperties}
          >
            <Link to={member.path} className="pin" aria-label={member.name}>
              <Avatar member={member} online={online.has(member.handle)} />
              <span className="name">{member.name.split(' ')[0]}</span>
            </Link>
          </div>
        ))}
      </div>
      <div className="core">
        <div>
          <div className="n">{count}</div>
          <div className="l">{label}</div>
        </div>
      </div>
    </div>
  );
}
