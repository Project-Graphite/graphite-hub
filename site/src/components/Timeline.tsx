import type { Release } from '../types';
import Browse from './Browse';
import ReleaseCard from './ReleaseCard';

interface Props {
  releases: Release[];
  showProject: boolean;
}

export default function Timeline({ releases, showProject }: Props) {
  return (
    <div className="mt-10 grid gap-12 border-t border-line-soft pt-7 lg:grid-cols-[minmax(0,1fr)_15rem]">
      <section aria-labelledby="releases">
        <h2 id="releases" className="mono-sm m-0 mb-6 font-normal text-faint">
          releases · {releases.length}
        </h2>
        {releases.length === 0 ? (
          <div className="rounded-lg border border-dashed border-line p-6">
            <p className="m-0 text-muted">No releases recorded yet.</p>
            <p className="mono-sm mt-2 mb-0 text-faint">
              Push a vX.Y.Z tag, or child-slug/vX.Y.Z for a project inside an epic, and the daily
              sync drafts the entry from the commits since the previous version.
            </p>
          </div>
        ) : (
          <div className="grid gap-4">
            {releases.map((release) => (
              <ReleaseCard key={release.id} release={release} showProject={showProject} />
            ))}
          </div>
        )}
      </section>

      <aside className="lg:sticky lg:top-24 lg:self-start">
        <Browse />
      </aside>
    </div>
  );
}
