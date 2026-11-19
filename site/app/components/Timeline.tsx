import { plural } from '../format';
import type { Release, ReleaseGroup } from '../types';
import ReleaseCard from './ReleaseCard';
import Section from './Section';

interface Props {
  releases: Release[];
  groups: Record<string, ReleaseGroup[]>;
  showProject: boolean;
}

export default function Timeline({ releases, groups, showProject }: Props) {
  return (
    <Section
      label="releases"
      action={
        <span className="mono-sm text-muted">
          {releases.length} {plural(releases.length, 'release')}
        </span>
      }
    >
      {releases.length === 0 ? (
        <p className="none">no releases yet</p>
      ) : (
        <ol className="log">
          {releases.map((release) => (
            <ReleaseCard
              key={release.id}
              release={release}
              groups={groups[release.id]}
              showProject={showProject}
            />
          ))}
        </ol>
      )}
    </Section>
  );
}
