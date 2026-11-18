import type { CSSProperties } from 'react';
import { Link } from 'react-router';
import { day } from '../format';
import { useHub } from '../hub';
import { changelogPath, compareUrl, releaseTitle } from '../model';
import { useSpotlight } from '../motion/motion';
import type { Release, ReleaseGroup } from '../types';
import { accentStyle } from './kit/basics';
import { Icon } from './kit/icons';
import { CHANGE_COLOR, ChangeMix } from './kit/releases';

interface Props {
  release: Release;
  groups: ReleaseGroup[];
  showProject: boolean;
}

export default function ReleaseCard({ release, groups, showProject }: Props) {
  const { memberByHandle, projectBySlug } = useHub();
  const spot = useSpotlight<HTMLElement>();
  const project = projectBySlug(release.project)!;
  const epic = project.parent ? projectBySlug(project.parent) : undefined;
  const owner = memberByHandle(project.owner);
  const title = releaseTitle(release, project.name);

  return (
    <li>
      <article
        ref={spot}
        id={release.id}
        className="log-entry spot"
        style={accentStyle(project.accent ?? owner?.accent)}
      >
        <header className="head">
          <div>
            {showProject && (
              <span className="project">
                {epic && (
                  <>
                    <Link to={changelogPath(epic)}>{epic.name}</Link>
                    <span> / </span>
                  </>
                )}
                <Link to={changelogPath(project)}>{project.name}</Link>
              </span>
            )}
            <h3>
              <a href={`#${release.id}`}>v{release.version}</a>
              {title && <span className="title">{title}</span>}
            </h3>
          </div>
          <time dateTime={release.date} className="when">
            {day(release.date)}
          </time>
        </header>
        <ChangeMix release={release} />
        {release.summary?.split(/\n\s*\n/).map((paragraph, index) => (
          <p key={index} className="summary">
            {paragraph}
          </p>
        ))}
        {groups.map((group) => (
          <section key={group.type} className="changes">
            <h4>
              <i style={{ '--c': CHANGE_COLOR[group.type] } as CSSProperties} />
              {group.type}
            </h4>
            <ul>
              {group.changes.map((change, index) => (
                <li key={index}>
                  {change.text}
                  <span className="meta">
                    {change.commit && (
                      <a href={`${project.repoUrl}/commit/${change.commit}`}>{change.commit}</a>
                    )}
                    {change.pr && <a href={`${project.repoUrl}/pull/${change.pr}`}>#{change.pr}</a>}
                    {change.author && <span>{change.author}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
        <footer className="foot">
          <span>
            owned by {owner ? <Link to={changelogPath(owner)}>{owner.name}</Link> : project.owner}
          </span>
          <span className="links">
            <a href={compareUrl(project, release)} className="rule-link">
              {release.previous ? 'compare' : 'commits'}
              <Icon name="external" />
            </a>
            <Link to={project.path} className="rule-link">
              project
            </Link>
          </span>
        </footer>
      </article>
    </li>
  );
}
