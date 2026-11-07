import { useCallback } from 'react';
import { Link } from 'react-router';
import { day } from '../../format';
import { useHub } from '../../hub';
import { useSpotlight, useTilt } from '../../motion/motion';
import type { Member, Project } from '../../types';
import Status from '../Status';
import TagList from '../TagList';
import { accentStyle, Avatar, Cover } from './basics';
import { Views } from './live';

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
  const accent = project.accent ?? owner?.accent ?? '';
  const latest = useHub().postsAbout(project)[0];
  return (
    <article ref={pointer} className="window spot tilt" style={accentStyle(accent)}>
      <WindowBar project={project} />
      <div className="pane">
        <Cover name={project.name} seed={project.slug} accent={accent} image={project.coverUrl} />
        {latest && (
          <Link to={latest.path} className="drawer">
            <span className="kind" data-kind="post">
              post
            </span>
            <span className="line">{latest.title}</span>
            <time dateTime={latest.publishedAt}>{day(latest.publishedAt)}</time>
          </Link>
        )}
      </div>
      <div className="body">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h3>
            <Link to={project.path}>{project.name}</Link>
          </h3>
          <Status status={project.status} />
        </div>
        <p>{project.summary}</p>
        <span className="who">
          {owner && (
            <span className="by">
              <Avatar member={owner} size="xs" />
              {owner.name}
            </span>
          )}
          <Views kind="project" id={project.slug} />
        </span>
        <TagList tags={project.tags.slice(0, 3)} />
      </div>
    </article>
  );
}

export function AccentCard({ project, owner }: Props) {
  const pointer = useCardPointer<HTMLElement>();
  return (
    <article
      ref={pointer}
      className="card spot tilt"
      style={accentStyle(project.accent ?? owner?.accent)}
    >
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
