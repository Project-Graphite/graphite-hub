import Topology from './Topology';
import type { Project } from '../types';
import styles from './ProjectCard.module.css';

const STATUS_LABEL: Record<string, string> = {
  live: 'live',
  wip: 'in progress',
  archived: 'archived',
  'source-only': 'source only',
};

interface Props {
  project: Project;
}

export default function ProjectCard({ project }: Props) {
  const host = project.url
    ? project.url.replace('https://', '')
    : `${project.slug}.project-graphite.com`;

  return (
    <article className={styles.card}>
      <div>
        <div className={styles.heading}>
          <h2>{project.name}</h2>
          <span className={styles.status} data-status={project.status}>
            <span className={styles.dot} />
            {STATUS_LABEL[project.status]}
          </span>
        </div>

        <p className={styles.summary}>{project.summary}</p>

        <ul className={`${styles.tags} mono`}>
          {project.tags.map((tag) => (
            <li key={tag}>{tag}</li>
          ))}
        </ul>

        <div className={`${styles.foot} mono`}>
          <span>{project.authors.join(' · ')}</span>
          <span className={styles.links}>
            {project.url && <a href={project.url}>visit ↗</a>}
            <a href={project.repoUrl}>source ↗</a>
          </span>
        </div>
      </div>

      {project.topology && (
        <div className={styles.diagram}>
          <Topology topology={project.topology} host={host} />
        </div>
      )}
    </article>
  );
}
