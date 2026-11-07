import { Link } from 'react-router';
import AuthorLink from '../components/AuthorLink';
import { accentStyle, Avatar, Button, Cover, Panel } from '../components/kit/basics';
import { ReadingBadge } from '../components/kit/live';
import { Fact, PageHeader } from '../components/kit/page';
import { ChangelogPanel, RunningPanel } from '../components/kit/panels';
import { PostCard, WritingStrip } from '../components/kit/posts';
import { WindowBar } from '../components/kit/projects';
import { ReleaseHistory } from '../components/kit/releases';
import { SubscribePanel } from '../components/kit/subscribe';
import ProjectTile from '../components/ProjectTile';
import Section from '../components/Section';
import { Page } from '../components/Shell';
import Status from '../components/Status';
import TagList from '../components/TagList';
import type { Hub } from '../context';
import { day, plural, shortTag } from '../format';
import { useHub, useRoot } from '../hub';
import { useView, useViews } from '../live';
import { changelogPath } from '../model';
import type { Deploy, Project } from '../types';

export function loadProject({ reads, directory, viewer, presence }: Hub, project: Project) {
  const owner = directory.members.find((member) => member.handle === project.owner);
  return {
    page: 'project' as const,
    reading: presence.reading(project.slug),
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

function groupDeploys(deploys: Deploy[]) {
  return deploys.reduce<(Deploy & { count: number })[]>((rows, deploy) => {
    const last = rows.at(-1);
    if (last && last.tag === deploy.tag && last.ok === deploy.ok) {
      last.count += 1;
    } else {
      rows.push({ ...deploy, count: 1 });
    }
    return rows;
  }, []);
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
  const deploys = groupDeploys(loaderData.deploys);
  const linked = project.feature.posts.flatMap((id) => hub.postById(id) ?? []);
  const writing = hub.postsAbout(project);
  const views = useViews(useRoot()!.views)('project', project.slug);
  useView('project', project.slug);

  return (
    <Page
      rail={
        <>
          {loaderData.running.length > 0 && <RunningPanel running={loaderData.running} />}
          <ChangelogPanel
            releases={releases.slice(0, settings['rail.changelog.count'] + 1)}
            projectOf={(release) => projectBySlug(release.project)}
          />
          <SubscribePanel
            scope={{ kind: 'project', slug: project.slug }}
            title={`follow ${project.name}`}
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
      <div className="profile" style={accentStyle(accent)}>
        <PageHeader
          banner={
            project.layout === 'window' ? (
              <div className="window">
                <WindowBar project={project} />
                <Cover
                  name={project.name}
                  seed={project.slug}
                  accent={accent}
                  image={project.coverUrl}
                />
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
          aside={
            <>
              <Status status={project.status} />
              <ReadingBadge id={project.slug} initial={loaderData.reading} />
            </>
          }
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
              <Fact value={releases.length} label={plural(releases.length, 'release')} />
              {releases[0] && <Fact label="released" value={day(releases[0].date)} />}
              {views > 0 && <Fact value={views} label={plural(views, 'view')} />}
            </>
          }
        >
          <p className="lede">{project.summary}</p>
          <TagList tags={project.tags} className="mt-4.5" />
        </PageHeader>

        {(project.feature.note || project.feature.screenshotUrl || linked.length > 0) && (
          <Section label="feature">
            <div className="feature">
              {project.feature.screenshotUrl && (
                <img src={project.feature.screenshotUrl} alt="" loading="lazy" />
              )}
              {project.feature.note && (
                <p className="whitespace-pre-line text-muted">{project.feature.note}</p>
              )}
              {linked.length > 0 && (
                <div className="linked">
                  {linked.map((post) => (
                    <PostCard key={post.id} post={post} compact />
                  ))}
                </div>
              )}
            </div>
          </Section>
        )}

        {writing.length > 0 && (
          <Section
            label={settings['blog.project.title']}
            action={
              <Link to={`/blog?project=${project.slug}`} className="rule-link mono-sm">
                {writing.length} {plural(writing.length, 'post')}
              </Link>
            }
          >
            <WritingStrip posts={writing} label={`posts about ${project.name}`} />
          </Section>
        )}

        {releases.length > 0 && (
          <Section
            label="releases"
            action={
              <Link to={changelogPath(project)} className="rule-link mono-sm">
                changelog
              </Link>
            }
          >
            <ReleaseHistory
              releases={releases}
              projectOf={(release) => projectBySlug(release.project)}
              accentOf={() => accent || 'var(--color-muted)'}
              today={loaderData.today}
              days={settings['home.timeline.days']}
              showProject={children.length > 0}
            />
          </Section>
        )}

        {deploys.length > 0 && (
          <Section
            label="deploys"
            action={
              loaderData.running[0] && (
                <span className="week" aria-hidden="true">
                  {loaderData.running[0].week.map((state, index) => (
                    <i key={index} className={state === 'none' ? '' : state} />
                  ))}
                </span>
              )
            }
          >
            <ol className="deploys">
              {deploys.map((deploy) => (
                <li key={deploy.at}>
                  <span className="tag">sha-{shortTag(deploy.tag)}</span>
                  <Status status={deploy.ok ? 'live' : 'archived'} />
                  <span className="when">{day(deploy.at)}</span>
                  <span className="meta">
                    {Math.round(deploy.durationMs / 1000)} s
                    {deploy.healthStatus ? ` · health ${deploy.healthStatus}` : ''}
                  </span>
                  {deploy.count > 1 && <span className="tag">×{deploy.count}</span>}
                </li>
              ))}
            </ol>
          </Section>
        )}

        {project.showcase && (
          <Section label="case study">
            <div className="study">
              <div>
                <h3>problem</h3>
                <p>{project.showcase.problem}</p>
              </div>
              <div>
                <h3>approach</h3>
                <p>{project.showcase.approach}</p>
              </div>
              <div>
                <h3>outcome</h3>
                <p>{project.showcase.outcome}</p>
              </div>
            </div>
          </Section>
        )}

        {children.length > 0 && (
          <Section label="projects">
            <div className="nodes">
              {children.map((child) => (
                <ProjectTile key={child.path} project={child} />
              ))}
            </div>
          </Section>
        )}

        <Section label="details">
          <dl className="details">
            <div>
              <dt>maintained by</dt>
              <dd>
                {owner ? (
                  <Link to={owner.path} className="hover:underline">
                    {owner.name}
                  </Link>
                ) : (
                  project.owner
                )}
              </dd>
            </div>
            {project.url && (
              <div>
                <dt>running at</dt>
                <dd>
                  <a href={project.url} className="hover:underline">
                    {project.url.replace('https://', '')} ↗
                  </a>
                </dd>
              </div>
            )}
            <div>
              <dt>source</dt>
              <dd>
                <a href={project.repoUrl} className="hover:underline">
                  {project.repo} ↗
                </a>
              </dd>
            </div>
            {parent && (
              <div>
                <dt>part of</dt>
                <dd>
                  <Link to={parent.path} className="hover:underline">
                    {parent.name}
                  </Link>
                </dd>
              </div>
            )}
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
      </div>
    </Page>
  );
}
