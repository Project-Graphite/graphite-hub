import type { Route } from './+types/members';
import { Orbit, People } from '../components/kit/members';
import { loadRail, PageHero, RAIL_TOPICS, StandardRail } from '../components/kit/page';
import { Page } from '../components/Shell';
import { hubContext } from '../context';
import { useHub } from '../hub';
import { MEMBERS } from '../meta';

export const handle = { topics: RAIL_TOPICS };

export function loader({ context }: Route.LoaderArgs) {
  return loadRail(context.get(hubContext));
}

export default function Members({ loaderData }: Route.ComponentProps) {
  const hub = useHub();
  const projectsOf = (member: (typeof hub.members)[number]) =>
    hub.projectsForMember(member).length + hub.epicsForMember(member).length;
  return (
    <Page rail={<StandardRail {...loaderData} />}>
      <PageHero crumb="/members" title="Members">
        <p className="lede">{MEMBERS.description}</p>
      </PageHero>
      <section className="band">
        <div className="split">
          <People members={hub.members} projectsOf={projectsOf} />
          <Orbit members={hub.members} count={hub.members.length} label="members" />
        </div>
      </section>
    </Page>
  );
}
