import type { Route } from './+types/epics';
import EpicCard from '../components/EpicCard';
import { Fact, loadRail, PageHeader, RAIL_TOPICS, StandardRail } from '../components/kit/page';
import { Page } from '../components/Shell';
import { hubContext } from '../context';
import { useHub } from '../hub';

export const handle = { topics: RAIL_TOPICS };

export function loader({ context }: Route.LoaderArgs) {
  return loadRail(context.get(hubContext));
}

export default function Epics({ loaderData }: Route.ComponentProps) {
  const { childProjects, epics, memberByHandle, releasesForProject } = useHub();
  return (
    <Page rail={<StandardRail {...loaderData} />}>
      <PageHeader
        path="/epics"
        title="Epics"
        facts={
          <>
            <Fact value={epics.length} label="epics" />
            <Fact
              value={epics.reduce((sum, epic) => sum + childProjects(epic.slug).length, 0)}
              label="projects inside"
            />
            <Fact
              value={epics.reduce((sum, epic) => sum + releasesForProject(epic).length, 0)}
              label="releases"
            />
          </>
        }
      />
      <section className="band grid gap-5">
        {epics.length === 0 ? (
          <p className="mono-sm text-faint">No epics registered yet.</p>
        ) : (
          epics.map((epic) => (
            <EpicCard
              key={epic.path}
              epic={epic}
              projects={childProjects(epic.slug)}
              accent={memberByHandle(epic.owner)?.accent}
            />
          ))
        )}
      </section>
    </Page>
  );
}
