import type { Route } from './+types/members';
import { Orbit, People } from '../components/kit/members';
import { Fact, loadRail, PageHeader, RAIL_TOPICS, StandardRail } from '../components/kit/page';
import { Page } from '../components/Shell';
import { hubContext } from '../context';
import { useHub } from '../hub';

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
      <PageHeader
        path="/members"
        title="Members"
        facts={
          <>
            <Fact value={hub.members.length} label="members" />
            <Fact value={hub.projects.length} label="projects" />
            <Fact value={hub.releases.length} label="releases" />
          </>
        }
      />
      <section className="band">
        <div className="split">
          <People members={hub.members} projectsOf={projectsOf} />
          <Orbit members={hub.members} count={hub.members.length} label="members" />
        </div>
      </section>
    </Page>
  );
}
