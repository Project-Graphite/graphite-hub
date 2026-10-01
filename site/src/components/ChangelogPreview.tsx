import { CHANGELOG, projectBySlug, releases, releasesForProject } from '../registry';
import type { Project } from '../types';

interface Props {
  project?: Project;
}

export default function ChangelogPreview({ project }: Props) {
  const shown = (project ? releasesForProject(project) : releases).slice(0, 3);
  const showProject = !project || project.kind === 'epic';

  return (
    <aside
      aria-labelledby="changelog-preview"
      className="self-start rounded-lg border border-line-soft bg-surface p-5"
    >
      <div className="mb-4 flex items-baseline justify-between gap-4">
        <h2 id="changelog-preview" className="mono-sm m-0 font-normal text-faint">
          changelog
        </h2>
        <a href={`${CHANGELOG}${project ? `${project.path}/` : '/'}`} className="rule-link mono-sm">
          full log ↗
        </a>
      </div>

      {shown.length === 0 ? (
        <p className="m-0 text-sm text-muted">No releases recorded yet.</p>
      ) : (
        <ol className="m-0 grid list-none gap-4 p-0">
          {shown.map((release) => {
            const released = projectBySlug(release.project)!;

            return (
              <li key={release.id}>
                <a
                  href={`${CHANGELOG}${released.path}/#${release.id}`}
                  className="group block text-ink no-underline"
                >
                  {showProject && (
                    <span className="mono-sm mb-0.5 block text-faint">{released.name}</span>
                  )}
                  <span className="mono-sm flex items-baseline justify-between gap-3 text-faint">
                    <strong className="font-semibold text-ink group-hover:underline">
                      v{release.version}
                    </strong>
                    <time dateTime={release.date} className="whitespace-nowrap">
                      {release.date}
                    </time>
                  </span>
                  <span className="mt-1 line-clamp-2 text-sm text-muted">
                    {release.title ?? release.summary ?? release.groups[0].changes[0].text}
                  </span>
                  <span className="mono-sm mt-1 block text-faint">
                    {release.groups
                      .map((group) => `${group.changes.length} ${group.type}`)
                      .join(' · ')}
                  </span>
                </a>
              </li>
            );
          })}
        </ol>
      )}
    </aside>
  );
}
