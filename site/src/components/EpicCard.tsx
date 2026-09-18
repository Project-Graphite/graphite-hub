import { Link } from 'react-router-dom';
import type { Project } from '../types';
import Status from './Status';
import TagList from './TagList';

interface Props {
  epic: Project;
  projects: Project[];
}

export default function EpicCard({ epic, projects }: Props) {
  return (
    <article className="rounded-xl border border-line bg-surface p-6 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mono-sm m-0 mb-2 text-faint">
            ongoing epic · {projects.length} {projects.length === 1 ? 'project' : 'projects'}
          </p>
          <h3 className="m-0 text-[1.65rem] font-semibold tracking-tight">
            <Link to={epic.path} className="text-ink no-underline hover:underline">
              {epic.name}
            </Link>
          </h3>
        </div>
        <Status status={epic.status} />
      </div>

      <p className="mt-4 mb-0 max-w-[64ch] text-muted">{epic.summary}</p>
      <TagList tags={epic.tags} className="mt-5" />

      {projects.length > 0 && (
        <div className="mt-7 grid gap-3 border-t border-line-soft pt-5 sm:grid-cols-2">
          {projects.map((project) => (
            <Link
              key={project.path}
              to={project.path}
              className="group rounded-lg border border-line-soft bg-paper p-4 text-ink no-underline hover:border-line"
            >
              <span className="flex items-baseline justify-between gap-3">
                <strong className="font-semibold group-hover:underline">{project.name}</strong>
                <Status status={project.status} />
              </span>
              <span className="mt-2 block text-sm text-muted">{project.summary}</span>
            </Link>
          ))}
        </div>
      )}
    </article>
  );
}
