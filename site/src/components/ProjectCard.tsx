import { Link } from 'react-router-dom';
import Status from './Status';
import TagList from './TagList';
import { memberByGithub } from '../registry';
import type { Project } from '../types';

interface Props {
  project: Project;
  context?: string;
}

export default function ProjectCard({ project, context }: Props) {
  return (
    <article className="flex h-full flex-col rounded-lg border border-line-soft bg-surface p-5 sm:p-6">
      <div className="flex items-baseline justify-between gap-4">
        <h3 className="m-0 text-[1.3rem] font-semibold tracking-tight">
          <Link to={project.path} className="text-ink no-underline hover:underline">
            {project.name}
          </Link>
        </h3>
        <Status status={project.status} />
      </div>

      <p className="mt-3.5 mb-0 flex-1 text-muted">{project.summary}</p>

      {context && (
        <p className="mt-4 mb-0 max-w-[52ch] border-l-2 border-line pl-4 text-sm text-muted">
          {context}
        </p>
      )}

      <TagList tags={project.tags} className="mt-4.5" />

      <div className="mono-sm mt-6 flex flex-wrap items-center justify-between gap-3 text-faint">
        <span className="flex flex-wrap gap-x-1.5">
          {project.authors.map((author, index) => {
            const member = memberByGithub(author);
            return (
              <span key={author}>
                {index > 0 && <span className="mr-1.5">·</span>}
                {member ? (
                  <Link
                    to={member.path}
                    className="text-faint transition-colors duration-200 hover:text-ink"
                  >
                    {member.name}
                  </Link>
                ) : (
                  <a
                    href={`https://github.com/${author}`}
                    className="text-faint transition-colors duration-200 hover:text-ink"
                  >
                    {author} ↗
                  </a>
                )}
              </span>
            );
          })}
        </span>
        <span className="flex gap-4.5">
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
