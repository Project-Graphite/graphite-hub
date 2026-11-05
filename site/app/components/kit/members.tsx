import type { CSSProperties } from 'react';
import { Link } from 'react-router';
import { useSpotlight } from '../../motion/motion';
import type { Member } from '../../types';
import { accentStyle, Avatar } from './basics';

function MemberRow({ member, projects }: { member: Member; projects: number }) {
  const spot = useSpotlight<HTMLAnchorElement>();
  const stack = member.stack.flatMap((group) => group.items).slice(0, 7);
  return (
    <Link ref={spot} to={member.path} className="spot" style={accentStyle(member.accent)}>
      <Avatar member={member} />
      <span>
        <strong>{member.name}</strong>
        <span className="headline">{member.headline ?? `@${member.github}`}</span>
      </span>
      <span className="links">
        {member.links.map((link) => (
          <i key={link.url}>{link.label}</i>
        ))}
      </span>
      <span className="more">
        <p>
          {member.bio ??
            `No bio yet. The profile is filled from GitHub until ${member.name.split(' ')[0]} edits it.`}
        </p>
        <span className="facts">
          <span>
            <b>{projects}</b> {projects === 1 ? 'project' : 'projects'}
          </span>
          {member.joined && (
            <span>
              on GitHub since <b>{member.joined}</b>
            </span>
          )}
        </span>
        {stack.length > 0 && (
          <span className="stack">
            {stack.map((item) => (
              <i key={item}>{item}</i>
            ))}
          </span>
        )}
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
  return (
    <div className="people">
      {members.map((member) => (
        <MemberRow key={member.handle} member={member} projects={projectsOf(member)} />
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
              <Avatar member={member} />
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
