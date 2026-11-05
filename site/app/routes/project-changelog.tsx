import Browse from '../components/Browse';
import { accentStyle, Button, Panel } from '../components/kit/basics';
import { Fact, PageHeader } from '../components/kit/page';
import { Page } from '../components/Shell';
import { Link } from 'react-router';
import type { Route } from './+types/project-changelog';
import Status from '../components/Status';
import TagList from '../components/TagList';
import Timeline from '../components/Timeline';
import { day } from '../format';
import { found, modelFrom, useHub } from '../hub';
import { changelogPath } from '../model';

export function loader({ context, params }: Route.LoaderArgs) {
  const project = found(modelFrom(context).projectByRoute(params.parentSlug, params.slug));
  return { parent: project.parent ?? undefined, slug: project.slug };
}

export default function ProjectChangelog({ loaderData }: Route.ComponentProps) {
  const { childProjects, memberByHandle, projectByRoute, projectBySlug, releasesForProject } =
    useHub();
  const project = projectByRoute(loaderData.parent, loaderData.slug)!;
  const owner = memberByHandle(project.owner);
  const epic = project.parent ? projectBySlug(project.parent) : undefined;
  const children = childProjects(project.slug);
  const releases = releasesForProject(project);
  const first = releases.at(-1);

  return (
    <Page
      rail={
        <Panel title="browse">
          <Browse />
        </Panel>
      }
    >
      <div className="profile" style={accentStyle(project.accent ?? owner?.accent)}>
        <PageHeader
          path={
            <>
              /changelog/{changelogPath(project).split('/')[2]}/
              {epic && (
                <>
                  <Link to={changelogPath(epic)} className="hover:text-ink hover:underline">
                    {epic.slug}
                  </Link>
                  /
                </>
              )}
              {project.slug}
            </>
          }
          title={project.name}
          aside={<Status status={project.status} />}
          actions={
            <>
              <Button to={project.path}>project page</Button>
              <Button to={project.repoUrl}>source ↗</Button>
            </>
          }
          facts={
            <>
              <Fact value={releases.length} label="releases" />
              {releases[0] && <Fact label="latest" value={`v${releases[0].version}`} />}
              {first && releases.length > 1 && <Fact label="since" value={day(first.date)} />}
              {owner && (
                <Fact
                  label="by"
                  value={
                    <Link to={changelogPath(owner)} className="hover:underline">
                      {owner.name}
                    </Link>
                  }
                />
              )}
            </>
          }
        >
          <p className="lede">{project.summary}</p>
          <TagList tags={project.tags} className="mt-4.5" />
          {(epic || children.length > 0) && (
            <nav className="kin" aria-label="Related changelogs">
              {epic && (
                <Link to={changelogPath(epic)} className="up">
                  ← {epic.name}
                </Link>
              )}
              {children.map((child) => (
                <Link key={child.path} to={changelogPath(child)}>
                  {child.name} →
                </Link>
              ))}
            </nav>
          )}
        </PageHeader>

        <Timeline releases={releases} showProject={children.length > 0} />
      </div>
    </Page>
  );
}
