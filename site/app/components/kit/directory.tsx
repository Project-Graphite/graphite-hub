import type { CSSProperties, KeyboardEvent, ReactNode } from 'react';
import { Link } from 'react-router';
import { day } from '../../format';
import { useSpotlight } from '../../motion/motion';
import type { Hit } from '../../search';
import type { Directory, Member, Project, Release } from '../../types';
import Status from '../Status';
import { accentStyle, Avatar } from './basics';

const MONTH = 30.4 * 86_400_000;

export function Pulse({
  releases,
  today,
  months = 12,
}: {
  releases: Release[];
  today: string;
  months?: number;
}) {
  const end = Date.parse(today) + 86_400_000;
  const counts = Array.from({ length: months }, () => 0);
  for (const release of releases) {
    const slot = months - 1 - Math.floor((end - Date.parse(release.date)) / MONTH);
    if (slot >= 0 && slot < months) {
      counts[slot] += 1;
    }
  }
  const peak = Math.max(1, ...counts);
  return (
    <span className="pulse-bars" aria-hidden="true">
      {counts.map((count, index) => (
        <i
          key={index}
          className={count > 0 ? 'on' : ''}
          style={{ '--h': `${(2 + (count / peak) * 14).toFixed(1)}px` } as CSSProperties}
        />
      ))}
    </span>
  );
}

export interface Choice {
  id: string;
  label: string;
  count?: number;
}

export function Chips({
  choices,
  value,
  onChange,
  label,
}: {
  choices: Choice[];
  value: string;
  onChange: (id: string) => void;
  label: string;
}) {
  return (
    <div className="chips dir-chips" role="group" aria-label={label}>
      {choices.map((choice) => (
        <button
          key={choice.id}
          type="button"
          aria-pressed={value === choice.id}
          onClick={() => onChange(choice.id)}
        >
          {choice.label}
          {choice.count !== undefined && <b>{choice.count}</b>}
        </button>
      ))}
    </div>
  );
}

export function Highlight({ text, needle }: { text: string; needle: string }) {
  const query = needle.trim().toLowerCase();
  const at = query ? text.toLowerCase().indexOf(query) : -1;
  if (at < 0) {
    return text;
  }
  return (
    <>
      {text.slice(0, at)}
      <mark>{text.slice(at, at + query.length)}</mark>
      {text.slice(at + query.length)}
    </>
  );
}

export function describeHit(hit: Hit, { members, projects, releases }: Directory) {
  const member = hit.kind === 'member' ? members.find((entry) => entry.path === hit.to) : undefined;
  const project =
    hit.kind === 'project' ? projects.find((entry) => entry.path === hit.to) : undefined;
  const release =
    hit.kind === 'release' ? releases.find((entry) => hit.to.endsWith(`#${entry.id}`)) : undefined;
  return {
    member,
    project,
    release,
    accent: member?.accent ?? project?.accent ?? undefined,
    owner: project ? members.find((entry) => entry.handle === project.owner) : undefined,
  };
}

export function HitRow({
  hit,
  needle,
  directory,
  active,
  onHover,
  onPick,
}: {
  hit: Hit;
  needle: string;
  directory: Directory;
  active?: boolean;
  onHover?: () => void;
  onPick?: () => void;
}) {
  const { member, project, release, accent, owner } = describeHit(hit, directory);
  let lead: ReactNode;
  if (member) {
    lead = <Avatar member={member} size="md" />;
  } else if (project) {
    lead = (
      <span className="glyph" aria-hidden="true">
        {project.name.slice(0, 2)}
      </span>
    );
  } else {
    lead = (
      <span className="glyph version" aria-hidden="true">
        v
      </span>
    );
  }
  return (
    <Link
      to={hit.to}
      className="hit"
      data-kind={hit.kind}
      aria-current={active || undefined}
      style={accentStyle(accent)}
      onPointerEnter={onHover}
      onClick={onPick}
    >
      {lead}
      <span className="text">
        <span className="head">
          <strong>
            <Highlight text={hit.title} needle={needle} />
          </strong>
          {project && <Status status={project.status} />}
          {release && <time dateTime={release.date}>{day(release.date)}</time>}
          {owner && <span className="owner">{owner.name}</span>}
        </span>
        <span className="detail">
          <Highlight text={hit.detail} needle={needle} />
        </span>
      </span>
      <span className="kind" data-kind={hit.kind}>
        {hit.kind}
      </span>
    </Link>
  );
}

export function hitKeys(
  count: number,
  active: number,
  setActive: (next: number) => void,
  pick: () => void,
) {
  return (event: KeyboardEvent) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive(Math.min(active + 1, count - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive(Math.max(active - 1, 0));
    } else if (event.key === 'Enter' && count > 0) {
      event.preventDefault();
      pick();
    }
  };
}

export function ProjectNode({
  project,
  owner,
  releases,
  today,
}: {
  project: Project;
  owner: Member | undefined;
  releases: Release[];
  today: string;
}) {
  const spot = useSpotlight<HTMLAnchorElement>();
  return (
    <Link
      ref={spot}
      to={project.path}
      className="node spot"
      style={accentStyle(project.accent ?? owner?.accent)}
    >
      <span className="head">
        <strong>{project.name}</strong>
        <Status status={project.status} />
      </span>
      <span className="summary">{project.summary}</span>
      <span className="foot">
        {owner && (
          <span className="by">
            <Avatar member={owner} size="xs" />
            {owner.name}
          </span>
        )}
        <span className="count">
          {releases[0] ? `v${releases[0].version} · ${day(releases[0].date)}` : 'unreleased'}
        </span>
        <Pulse releases={releases} today={today} />
      </span>
    </Link>
  );
}
