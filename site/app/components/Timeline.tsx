import type { Release } from '../types';
import ReleaseCard from './ReleaseCard';
import Section from './Section';

interface Props {
  releases: Release[];
  showProject: boolean;
}

export default function Timeline({ releases, showProject }: Props) {
  return (
    <Section label={`releases · ${releases.length}`}>
      {releases.length === 0 ? (
        <p className="none">no releases yet</p>
      ) : (
        <ol className="log">
          {releases.map((release) => (
            <ReleaseCard key={release.id} release={release} showProject={showProject} />
          ))}
        </ol>
      )}
    </Section>
  );
}
