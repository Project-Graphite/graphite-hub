import { useCallback } from 'react';
import { Link } from 'react-router';
import { useSpotlight, useTilt } from '../../motion/motion';
import type { Member, Project } from '../../types';
import Status from '../Status';
import TagList from '../TagList';
import { accentStyle, Avatar, Cover } from './basics';

interface Props {
  project: Project;
  owner: Member | undefined;
}

function useCardPointer<T extends HTMLElement>() {
  const tilt = useTilt<T>();
  const spot = useSpotlight<T>();
  return useCallback(
    (element: T | null) => {
      tilt(element);
      spot(element);
    },
    [tilt, spot],
  );
}

export function WindowBar({ project }: { project: Project }) {
  return (
    <div className="bar">
      <i />
      <i />
      <i />
      <a href={project.url ?? project.repoUrl}>
        {project.url ? new URL(project.url).host : `${project.slug} · source only`}
      </a>
    </div>
  );
}

export function Window({ project, owner }: Props) {
  const pointer = useCardPointer<HTMLElement>();
  return (
    <article ref={pointer} className="window spot tilt" style={accentStyle(owner?.accent)}>
      <WindowBar project={project} />
      <Cover name={project.name} accent={owner?.accent ?? ''} />
      <div className="body">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h3>
            <Link to={project.path}>{project.name}</Link>
          </h3>
          <Status status={project.status} />
        </div>
        <p>{project.summary}</p>
        {owner && (
          <span className="by">
            <Avatar member={owner} size="xs" />
            {owner.name}
          </span>
        )}
        <TagList tags={project.tags.slice(0, 3)} />
      </div>
    </article>
  );
}

export function AccentCard({ project, owner }: Props) {
  const spot = useSpotlight<HTMLElement>();
  return (
    <article ref={spot} className="card spot" style={accentStyle(owner?.accent)}>
      <div className="title">
        <h3>
          <Link to={project.path}>{project.name}</Link>
        </h3>
        <Status status={project.status} />
      </div>
      <p className="summary">{project.summary}</p>
      <TagList tags={project.tags} className="mt-4.5" />
      <div className="foot">
        {owner ? (
          <span className="by">
            <Avatar member={owner} size="xs" />
            {owner.name}
          </span>
        ) : (
          <span>{project.owner}</span>
        )}
        <span className="links">
          {project.url && (
            <a href={project.url} className="rule-link">
              visit ↗
            </a>
          )}
          <a href={project.repoUrl} className="rule-link">
            source ↗
          </a>
        </span>
      </div>
    </article>
  );
}
