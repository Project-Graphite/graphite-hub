import { Link } from 'react-router';
import Status from './Status';
import type { Project } from '../types';

interface Props {
  project: Project;
}

export default function ProjectTile({ project }: Props) {
  return (
    <Link
      to={project.path}
      className="group rounded-lg border border-line-soft bg-paper p-4 text-ink no-underline transition-colors duration-200 hover:border-line"
    >
      <span className="flex items-baseline justify-between gap-3">
        <strong className="font-semibold group-hover:underline">{project.name}</strong>
        <Status status={project.status} />
      </span>
      <span className="mt-2 block text-sm text-muted">{project.summary}</span>
    </Link>
  );
}
