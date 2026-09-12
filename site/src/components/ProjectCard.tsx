import Topology from './Topology';
import type { Project } from '../types';

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
    <article className="grid grid-cols-[minmax(0,1fr)_minmax(0,23rem)] items-center gap-9 border-b border-line-soft py-11 max-[860px]:grid-cols-1 max-[860px]:gap-7">
      <div>
        <div className="flex max-w-[46ch] items-baseline justify-between gap-4">
          <h2 className="m-0 text-[1.45rem] font-semibold tracking-[-0.025em]">{project.name}</h2>
          <span
            className="group inline-flex items-center gap-[7px] whitespace-nowrap text-[0.8rem] text-muted"
            data-status={project.status}
          >
            <span className="size-[7px] rounded-full bg-dormant group-data-[status=live]:bg-live group-data-[status=wip]:bg-wip" />
            {STATUS_LABEL[project.status]}
          </span>
        </div>

        <p className="mt-3.5 mb-0 max-w-[46ch] text-muted">{project.summary}</p>

        <ul className="mt-[18px] flex list-none flex-wrap gap-1.5 p-0 font-mono text-[0.82em]">
          {project.tags.map((tag) => (
            <li key={tag} className="rounded-full border border-line px-2.5 py-0.5 text-faint">
              {tag}
            </li>
          ))}
        </ul>

        <div className="mt-6 flex max-w-[46ch] flex-wrap items-center justify-between gap-3 font-mono text-[0.82em] text-faint">
          <span>{project.authors.join(' · ')}</span>
          <span className="flex gap-[18px] [&_a]:border-b [&_a]:border-line [&_a]:pb-px [&_a]:text-ink [&_a]:no-underline [&_a:hover]:border-ink">
            {project.url && <a href={project.url}>visit ↗</a>}
            <a href={project.repoUrl}>source ↗</a>
          </span>
        </div>
      </div>

      {project.topology && (
        <div className="max-[860px]:order-first">
          <Topology topology={project.topology} host={host} />
        </div>
      )}
    </article>
  );
}
