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
    <Section label={`releases · ${releases.length}`}>
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
