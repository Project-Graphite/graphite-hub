import { Link } from 'react-router';
import type { Project } from '../types';
import ProjectTile from './ProjectTile';
import Status from './Status';
import TagList from './TagList';

interface Props {
  epic: Project;
  projects: Project[];
  context?: string;
}

export default function EpicCard({ epic, projects, context }: Props) {
  return (
    <article className="rounded-xl border border-line bg-surface p-6 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mono-sm m-0 mb-2 text-faint">
            epic · {projects.length} {projects.length === 1 ? 'project' : 'projects'}
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

      {context && (
        <p className="mt-4 mb-0 max-w-[64ch] border-l-2 border-line pl-4 text-sm text-muted">
          {context}
        </p>
      )}

      <TagList tags={epic.tags} className="mt-5" />

      {projects.length > 0 && (
        <div className="mt-7 grid gap-3 border-t border-line-soft pt-5 sm:grid-cols-2">
          {projects.map((project) => (
            <ProjectTile key={project.path} project={project} />
          ))}
        </div>
      )}
    </article>
  );
}
