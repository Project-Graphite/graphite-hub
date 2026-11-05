import type { Route } from './+types/epics';
import EpicCard from '../components/EpicCard';
import { loadRail, PageHero, RAIL_TOPICS, StandardRail } from '../components/kit/page';
import { Page } from '../components/Shell';
import { hubContext } from '../context';
import { useHub } from '../hub';
import { EPICS } from '../meta';

export const handle = { topics: RAIL_TOPICS };

export function loader({ context }: Route.LoaderArgs) {
  return loadRail(context.get(hubContext));
}

export default function Epics({ loaderData }: Route.ComponentProps) {
  const { childProjects, epics, memberByHandle } = useHub();
  return (
    <Page rail={<StandardRail {...loaderData} />}>
      <PageHero crumb="/epics" title="Epics">
        <p className="lede">{EPICS.description}</p>
      </PageHero>
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
