import { Link } from 'react-router';
import { changelogPath, compareUrl, memberByHandle, projectBySlug } from '../registry';
import type { ChangeType, Release } from '../types';

const DOT: Record<ChangeType, string> = {
  breaking: 'bg-danger',
  security: 'bg-danger',
  added: 'bg-live',
  changed: 'bg-dormant',
  fixed: 'bg-wip',
  removed: 'bg-dormant',
};

interface Props {
  release: Release;
  showProject: boolean;
}

export default function ReleaseCard({ release, showProject }: Props) {
  const project = projectBySlug(release.project)!;
  const epic = project.parent ? projectBySlug(project.parent) : undefined;
  const owner = memberByHandle(project.owner)!;

  return (
    <article
      id={release.id}
      className="rounded-lg border border-line-soft bg-surface p-5 target:border-line sm:p-6"
    >
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1.5">
        <div>
          {showProject && (
            <p className="mono-sm m-0 mb-1.5 text-faint">
              {epic && (
                <>
                  <Link
                    to={changelogPath(epic)}
                    className="text-faint transition-colors duration-200 hover:text-ink hover:underline"
                  >
                    {epic.name}
                  </Link>
                  <span className="mx-1.5">/</span>
                </>
              )}
              <Link
                to={changelogPath(project)}
                className="text-muted transition-colors duration-200 hover:text-ink hover:underline"
              >
                {project.name}
              </Link>
            </p>
          )}
          <h3 className="m-0 text-[1.3rem] font-semibold tracking-tight">
            <a href={`#${release.id}`} className="text-ink no-underline hover:underline">
              v{release.version}
            </a>
            {release.title && <span className="font-normal text-muted"> — {release.title}</span>}
          </h3>
        </div>
        <time dateTime={release.date} className="mono-sm text-faint">
          {release.date}
        </time>
      </header>

      {release.summary?.split(/\n\s*\n/).map((paragraph, index) => (
        <p key={index} className="mt-3.5 mb-0 max-w-[64ch] text-muted">
          {paragraph}
        </p>
      ))}

      {release.groups.map((group) => (
        <section key={group.type} className="mt-5">
          <h4 className="mono-sm m-0 mb-2 flex items-center gap-2 font-normal text-faint">
            <span className={`size-1.75 rounded-full ${DOT[group.type]}`} />
            {group.type}
          </h4>
          <ul className="m-0 grid list-none gap-1.5 p-0">
            {group.changes.map((change, index) => (
              <li key={index} className="text-muted">
                {change.text}
                <span className="mono-sm ml-2 whitespace-nowrap text-faint">
                  <a
                    href={`${project.repoUrl}/commit/${change.commit}`}
                    className="text-faint transition-colors duration-200 hover:text-ink"
                  >
                    {change.commit}
                  </a>
                  {change.pr && (
                    <>
                      {' · '}
                      <a
                        href={`${project.repoUrl}/pull/${change.pr}`}
                        className="text-faint transition-colors duration-200 hover:text-ink"
                      >
                        #{change.pr}
                      </a>
                    </>
                  )}
                  {change.author && ` · ${change.author}`}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <footer className="mono-sm mt-6 flex flex-wrap items-center justify-between gap-3 text-faint">
        <span>
          owned by{' '}
          <Link
            to={changelogPath(owner)}
            className="text-faint transition-colors duration-200 hover:text-ink"
          >
            {owner.name}
          </Link>
        </span>
        <span className="flex gap-4.5">
          <a href={compareUrl(project, release)} className="rule-link">
            {release.previous ? 'compare' : 'commits'} ↗
          </a>
          <Link to={project.path} className="rule-link">
            project
          </Link>
        </span>
      </footer>
    </article>
  );
}
