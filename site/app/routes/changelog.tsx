import Browse from '../components/Browse';
import { Panel } from '../components/kit/basics';
import { Fact, PageHeader } from '../components/kit/page';
import { Page } from '../components/Shell';
import Timeline from '../components/Timeline';
import { useHub } from '../hub';

export default function Changelog() {
  const { projects, releases } = useHub();
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
            <Fact value={projects.length} label="projects" />
            {releases[0] && <Fact label="latest" value={releases[0].date} />}
          </>
        }
      />
      <Timeline releases={releases} showProject />
    </Page>
  );
}
