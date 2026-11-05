import type { Release } from '../types';
import ReleaseCard from './ReleaseCard';

interface Props {
  releases: Release[];
  showProject: boolean;
}

export default function Timeline({ releases, showProject }: Props) {
  return (
    <section aria-labelledby="releases" className="mt-10 border-t border-line-soft pt-7">
      <h2 id="releases" className="mono-sm m-0 mb-6 font-normal text-faint">
        releases · {releases.length}
      </h2>
      {releases.length === 0 ? (
        <div className="rounded-lg border border-dashed border-line p-6">
          <p className="m-0 text-muted">No releases recorded yet.</p>
          <p className="mono-sm mt-2 mb-0 text-faint">
            Publish a GitHub release tagged vX.Y.Z, or child-slug/vX.Y.Z for a project inside an
            epic, and it appears here within seconds.
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
  );
}
