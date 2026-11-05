import Browse from '../components/Browse';
import { accentStyle, Avatar, Button, Panel } from '../components/kit/basics';
import { Fact, PageHeader } from '../components/kit/page';
import { Page } from '../components/Shell';
import { Link } from 'react-router';
import type { Route } from './+types/member-changelog';
import Timeline from '../components/Timeline';
import { found, modelFrom, useHub } from '../hub';
import { changelogPath } from '../model';

export function loader({ context, params }: Route.LoaderArgs) {
  return { handle: found(modelFrom(context).memberByHandle(params.handle)).handle };
}

export default function MemberChangelog({ loaderData }: Route.ComponentProps) {
  const { memberByHandle, projectsOwnedBy, releasesOwnedBy } = useHub();
  const member = memberByHandle(loaderData.handle)!;
  const owned = projectsOwnedBy(member);
  const releases = releasesOwnedBy(member);

  return (
    <Page
      rail={
        <Panel title="browse">
          <Browse />
        </Panel>
      }
    >
      <div className="profile member" style={accentStyle(member.accent)}>
        <PageHeader
          path={`/changelog/members/${member.handle}`}
          lead={<Avatar member={member} size="lg" />}
          title={member.name}
          subtitle={member.headline}
          actions={<Button to={member.path}>profile</Button>}
          facts={
            <>
              <Fact value={releases.length} label="releases" />
              <Fact value={owned.length} label="projects" />
              {releases[0] && <Fact label="latest" value={`v${releases[0].version}`} />}
            </>
          }
        >
          {owned.length > 0 && (
            <nav className="kin" aria-label="Project changelogs">
              {owned.map((project) => (
                <Link key={project.path} to={changelogPath(project)}>
                  {project.name} →
                </Link>
              ))}
            </nav>
          )}
        </PageHeader>

        <Timeline releases={releases} showProject />
      </div>
    </Page>
  );
}
