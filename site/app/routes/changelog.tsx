import type { Route } from './+types/changelog';
import Browse from '../components/Browse';
import { Panel } from '../components/kit/basics';
import { Fact, PageHeader } from '../components/kit/page';
import { Page } from '../components/Shell';
import Timeline from '../components/Timeline';
import { hubContext } from '../context';
import { day, plural } from '../format';
import { useHub } from '../hub';
import { topicsFor } from '../topics';

export const handle = topicsFor('changelog');

export function loader({ context }: Route.LoaderArgs) {
  const { directory, reads } = context.get(hubContext);
  return { groups: reads.releaseGroups(directory.releases.map((release) => release.id)) };
}

export default function Changelog({ loaderData }: Route.ComponentProps) {
  const { rootProjects, epics, releases } = useHub();
  return (
    <Page
      rail={
        <Panel title="browse">
          <Browse />
        </Panel>
      }
    >
      <PageHeader
        path="/changelog"
        title="Changelog"
        facts={
          <>
            <Fact value={releases.length} label={plural(releases.length, 'release')} />
            <Fact value={rootProjects.length} label={plural(rootProjects.length, 'project')} />
            <Fact value={epics.length} label={plural(epics.length, 'epic')} />
            {releases[0] && <Fact label="latest" value={day(releases[0].date)} />}
          </>
        }
      />
      <Timeline releases={releases} groups={loaderData.groups} showProject />
    </Page>
  );
}
