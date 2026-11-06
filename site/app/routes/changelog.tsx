import Browse from '../components/Browse';
import { Panel } from '../components/kit/basics';
import { Fact, PageHeader } from '../components/kit/page';
import { Page } from '../components/Shell';
import Timeline from '../components/Timeline';
import { day } from '../format';
import { useHub } from '../hub';

export default function Changelog() {
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
            <Fact value={releases.length} label="releases" />
            <Fact value={rootProjects.length} label="projects" />
            <Fact value={epics.length} label={epics.length === 1 ? 'epic' : 'epics'} />
            {releases[0] && <Fact label="latest" value={day(releases[0].date)} />}
          </>
        }
      />
      <Timeline releases={releases} showProject />
    </Page>
  );
}
