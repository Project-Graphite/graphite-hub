import { Link } from 'react-router';
import AuthorLink from '../components/AuthorLink';
import { accentStyle, Avatar, Button, Cover, Panel } from '../components/kit/basics';
import { ReleaseTimeline } from '../components/kit/live';
import { Fact, PageHeader } from '../components/kit/page';
import { ChangelogPanel, RunningPanel } from '../components/kit/panels';
import { WindowBar } from '../components/kit/projects';
import ProjectTile from '../components/ProjectTile';
import Section from '../components/Section';
import { Page } from '../components/Shell';
import Status from '../components/Status';
import TagList from '../components/TagList';
import type { Hub } from '../context';
import { day, shortTag } from '../format';
import { useHub, useRoot } from '../hub';
import type { Project } from '../types';

export const PROJECT_TOPICS = ['deploys', 'releases', 'projects', 'uptime'];

export function loadProject({ reads, directory, viewer }: Hub, project: Project) {
  const owner = directory.members.find((member) => member.handle === project.owner);
  return {
    page: 'project' as const,
    editable: Boolean(
      viewer && (viewer.owner || viewer.login.toLowerCase() === owner?.github.toLowerCase()),
    ),
    parent: project.parent ?? undefined,
    slug: project.slug,
    running: reads.running(directory).filter((running) => running.slug === project.slug),
    deploys: reads.deploys(project.slug, 8),
    today: new Date().toISOString().slice(0, 10),
  };
}

export function ProjectPage({ data: loaderData }: { data: ReturnType<typeof loadProject> }) {
  const hub = useHub();
  const settings = useRoot()!.settings;
  const { childProjects, memberByHandle, memberByGithub, projectByRoute, projectBySlug } = hub;
  const project = projectByRoute(loaderData.parent, loaderData.slug)!;
  const owner = memberByHandle(project.owner);
  const parent = project.parent ? projectBySlug(project.parent) : undefined;
  const children = childProjects(project.slug);
  const releases = hub.releasesForProject(project);
  const authors = project.authors.flatMap((login) => memberByGithub(login) ?? []);
  const accent = project.accent ?? owner?.accent ?? '';

  return (
    <Page
      rail={
        <>
          {loaderData.running.length > 0 && <RunningPanel running={loaderData.running} />}
          <ChangelogPanel
            releases={releases.slice(0, settings['rail.changelog.count'] + 1)}
            projectOf={(release) => projectBySlug(release.project)}
          />
          {authors.length > 0 && (
            <Panel title="built by">
              <div className="panel-list">
                {authors.map((author) => (
                  <Link key={author.handle} to={author.path}>
                    <Avatar member={author} size="md" />
                    <span>
                      <strong>{author.name}</strong>
                      <span className="headline">{author.headline ?? `@${author.github}`}</span>
                    </span>
                  </Link>
                ))}
              </div>
            </Panel>
          )}
        </>
      }
    >
      <PageHeader
        banner={
          project.layout === 'window' ? (
            <div className="window" style={accentStyle(accent)}>
              <WindowBar project={project} />
              <Cover name={project.name} accent={accent} image={project.coverUrl} />
            </div>
          ) : (
            project.coverUrl && <img className="member-cover" src={project.coverUrl} alt="" />
          )
        }
        path={
          <>
            /
            {parent && (
              <>
                <Link to={parent.path} className="hover:text-ink hover:underline">
                  {parent.slug}
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
            {loaderData.editable && owner && (
              <Button to={`${owner.path}/edit?project=${project.slug}`} primary>
                edit
              </Button>
            )}
            {project.url && <Button to={project.url}>visit ↗</Button>}
            <Button to={project.repoUrl}>source ↗</Button>
          </>
        }
        facts={
          <>
            {releases[0] && <Fact label="latest" value={`v${releases[0].version}`} />}
            <Fact value={releases.length} label="releases" />
            {releases[0] && <Fact label="released" value={day(releases[0].date)} />}
          </>
        }
      >
        <p className="lede">{project.summary}</p>
        <TagList tags={project.tags} className="mt-4.5" />
      </PageHeader>

      {(project.feature.note || project.feature.screenshotUrl) && (
        <Section label="feature">
          <div className="feature" style={accentStyle(accent)}>
            {project.feature.screenshotUrl && (
              <img src={project.feature.screenshotUrl} alt="" loading="lazy" />
            )}
            {project.feature.note && (
              <p className="whitespace-pre-line text-muted">{project.feature.note}</p>
            )}
          </div>
        </Section>
      )}

      {releases.length > 0 && (
        <Section label="releases">
          <ReleaseTimeline
            releases={releases}
            accentOf={() => owner?.accent ?? 'var(--color-muted)'}
            nameOf={(release) => projectBySlug(release.project)?.name ?? release.project}
            today={loaderData.today}
            days={settings['home.timeline.days']}
          />
        </Section>
      )}

      {loaderData.deploys.length > 0 && (
        <Section label="deploys">
          <div className="running">
            {loaderData.deploys.map((deploy) => (
              <div key={deploy.at} className="row">
                <span className="font-mono">sha-{shortTag(deploy.tag)}</span>
                <Status status={deploy.ok ? 'live' : 'archived'} />
                <span className="meta">
                  {day(deploy.at)} · {Math.round(deploy.durationMs / 1000)} s
                  {deploy.healthStatus ? ` · health ${deploy.healthStatus}` : ''}
                </span>
              </div>
            ))}
          </div>
          {loaderData.running[0] && (
            <span className="week">
              {loaderData.running[0].week.map((state, index) => (
                <i key={index} className={state === 'none' ? '' : state} />
              ))}
            </span>
          )}
        </Section>
      )}

      {project.showcase && (
        <Section label="case study">
          <div className="grid gap-7 md:grid-cols-3">
            <div>
              <h3 className="mono-sm m-0 mb-2 font-normal text-faint">problem</h3>
              <p className="m-0 text-muted">{project.showcase.problem}</p>
            </div>
            <div>
              <h3 className="mono-sm m-0 mb-2 font-normal text-faint">approach</h3>
              <p className="m-0 text-muted">{project.showcase.approach}</p>
            </div>
            <div>
              <h3 className="mono-sm m-0 mb-2 font-normal text-faint">outcome</h3>
              <p className="m-0 text-muted">{project.showcase.outcome}</p>
            </div>
          </div>
        </Section>
      )}

      {children.length > 0 && (
        <Section label="projects">
          <div className="grid gap-3 sm:grid-cols-2">
            {children.map((child) => (
              <ProjectTile key={child.path} project={child} />
            ))}
          </div>
        </Section>
      )}

      <Section label="details">
        <dl className="mono-sm grid grid-cols-[auto_minmax(0,1fr)] gap-x-8 gap-y-3">
          <dt className="text-faint">built by</dt>
          <dd className="m-0">
            {project.authors.map((author, index) => (
              <span key={author}>
                {index > 0 && <span className="mx-1.5 text-faint">·</span>}
                <AuthorLink github={author} className="text-ink hover:underline" />
              </span>
            ))}
          </dd>

          <dt className="text-faint">maintained by</dt>
          <dd className="m-0">
            {owner ? (
              <Link to={owner.path} className="text-ink hover:underline">
                {owner.name}
              </Link>
            ) : (
              project.owner
            )}
          </dd>

          {project.url && (
            <>
              <dt className="text-faint">running at</dt>
              <dd className="m-0">
                <a href={project.url} className="text-ink hover:underline">
                  {project.url.replace('https://', '')} ↗
                </a>
              </dd>
            </>
          )}

          <dt className="text-faint">source</dt>
          <dd className="m-0">
            <a href={project.repoUrl} className="text-ink hover:underline">
              {project.repo} ↗
            </a>
          </dd>
        </dl>
      </Section>

      {project.showcase && (
        <Section label="contributions">
          <div className="grid gap-5">
            {project.showcase.contributions.map((contribution) => (
              <article key={contribution.github} className="max-w-[56ch]">
                <h3 className="m-0 text-base font-semibold">
                  <AuthorLink github={contribution.github} className="text-ink hover:underline" />
                </h3>
                <p className="mt-2 mb-0 text-muted">{contribution.summary}</p>
              </article>
            ))}
          </div>
        </Section>
      )}
    </Page>
  );
}
