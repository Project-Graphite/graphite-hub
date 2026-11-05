import type { CSSProperties } from 'react';
import { Link } from 'react-router';
import { day } from '../../format';
import { changelogPath, releaseLine } from '../../model';
import { useSpotlight } from '../../motion/motion';
import type { ChangeType, Project, Release } from '../../types';
import { accentStyle } from './basics';
import { ReleaseTimeline } from './live';

export const CHANGE_COLOR: Record<ChangeType, string> = {
  breaking: 'var(--color-danger)',
  security: 'var(--color-danger)',
  added: 'var(--color-live)',
  changed: 'var(--color-post)',
  fixed: 'var(--color-wip)',
  removed: 'var(--color-dormant)',
};

const DAY = 86_400_000;
const DENSE_DAYS = 4;

interface HistoryProps {
  releases: Release[];
  projectOf: (release: Release) => Project | undefined;
  accentOf: (release: Release) => string;
  today: string;
  days: number;
  showProject?: boolean;
}

export function ChangeMix({ release }: { release: Release }) {
  return (
    <span className="mix" aria-hidden="true">
      {release.groups.length === 0 ? (
        <i />
      ) : (
        release.groups.map((group) => (
          <i
            key={group.type}
            style={
              {
                '--n': group.changes.length,
                '--c': CHANGE_COLOR[group.type],
              } as CSSProperties
            }
          />
        ))
      )}
    </span>
  );
}

function Node({
  release,
  project,
  accent,
  showProject,
}: {
  release: Release;
  project: Project | undefined;
  accent: string;
  showProject: boolean;
}) {
  const spot = useSpotlight<HTMLAnchorElement>();
  const name = project?.name ?? release.project;
  const changes = release.groups.reduce((sum, group) => sum + group.changes.length, 0);
  return (
    <li style={accentStyle(accent)}>
      <Link
        ref={spot}
        to={project ? `${changelogPath(project)}#${release.id}` : '/changelog'}
        className="release spot"
      >
        {showProject && <span className="project">{name}</span>}
        <span className="head">
          <strong>v{release.version}</strong>
          <time dateTime={release.date}>{day(release.date)}</time>
        </span>
        <ChangeMix release={release} />
        <span className="line">{releaseLine(release, name)}</span>
        <span className="n">
          {changes === 0 ? 'tagged' : changes === 1 ? '1 change' : `${changes} changes`}
        </span>
      </Link>
    </li>
  );
}

export function ReleaseStrip({
  releases,
  projectOf,
  accentOf,
  showProject = false,
}: Omit<HistoryProps, 'today' | 'days'>) {
  return (
    <div className="history">
      <ol>
        {releases.map((release) => (
          <Node
            key={release.id}
            release={release}
            project={projectOf(release)}
            accent={accentOf(release)}
            showProject={showProject}
          />
        ))}
      </ol>
    </div>
  );
}

export function ReleaseHistory(props: HistoryProps) {
  const { releases, projectOf, accentOf, today, days } = props;
  const since = Date.parse(today) - days * DAY;
  const dense =
    new Set(releases.filter((release) => Date.parse(release.date) >= since).map((r) => r.date))
      .size >= DENSE_DAYS;
  return dense ? (
    <ReleaseTimeline
      releases={releases}
      accentOf={accentOf}
      nameOf={(release) => projectOf(release)?.name ?? release.project}
      today={today}
      days={days}
    />
  ) : (
    <ReleaseStrip {...props} />
  );
}
