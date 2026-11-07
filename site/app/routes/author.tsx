import { Link, redirect } from 'react-router';
import type { Route } from './+types/author';
import { accentStyle, Avatar, Button, Panel } from '../components/kit/basics';
import { Fact, PageHeader } from '../components/kit/page';
import { ChangelogPanel } from '../components/kit/panels';
import { PostCard } from '../components/kit/posts';
import { Page } from '../components/Shell';
import { hubContext } from '../context';
import { plural } from '../format';
import { useHub, useRoot } from '../hub';
import { authorFrom, viewerHandle } from '../pages/blog';
import { topicsFor } from '../topics';

export const handle = topicsFor('author');

export function loader({ context, params }: Route.LoaderArgs) {
  const hub = context.get(hubContext);
  const author = authorFrom(hub, params);
  if (params.handle && author.alias) {
    throw redirect(`${author.path}/blog`, 301);
  }
  return {
    handle: author.handle,
    own: viewerHandle(hub) === author.handle || Boolean(hub.viewer?.owner),
  };
}

export const links = () => [
  { rel: 'alternate', type: 'application/rss+xml', title: 'RSS', href: '/blog/feed.xml' },
];

export default function Author({ loaderData }: Route.ComponentProps) {
  const hub = useHub();
  const settings = useRoot()!.settings;
  const author = hub.memberByHandle(loaderData.handle)!;
  const posts = hub.postsBy(author);
  const releases = hub.releasesOwnedBy(author);
  const projects = [...new Set(posts.flatMap((post) => post.project ?? []))].flatMap(
    (slug) => hub.projectBySlug(slug) ?? [],
  );
  const words = posts.reduce((sum, post) => sum + post.readingMinutes, 0);

  return (
    <Page
      rail={
        <>
          <Panel title="writer">
            <div className="panel-list">
              <Link to={author.path}>
                <Avatar member={author} size="md" />
                <span>
                  <strong>{author.name}</strong>
                  <span className="headline">{author.headline ?? `@${author.github}`}</span>
                </span>
              </Link>
            </div>
          </Panel>
          {projects.length > 0 && (
            <Panel title="written about">
              <ol className="mono-sm grid gap-1.5">
                {projects.map((project) => (
                  <li key={project.slug}>
                    <Link to={project.path} className="text-muted hover:text-ink">
                      {project.name}
                    </Link>
                  </li>
                ))}
              </ol>
            </Panel>
          )}
          {releases.length > 0 && (
            <ChangelogPanel
              releases={releases.slice(0, settings['rail.changelog.count'] + 1)}
              projectOf={(release) => hub.projectBySlug(release.project)}
            />
          )}
        </>
      }
    >
      <div className="blog profile" style={accentStyle(author.accent)}>
        <PageHeader
          path={
            <>
              <Link to={author.path} className="hover:text-ink hover:underline">
                {author.path}
              </Link>
              /blog
            </>
          }
          lead={<Avatar member={author} size="lg" />}
          title={`${author.name} writes`}
          subtitle={author.headline}
          actions={
            <>
              {loaderData.own && (
                <Button to="/blog/new" primary arrow>
                  write
                </Button>
              )}
              <Button to={author.path}>page</Button>
              <Button to="/blog">everyone</Button>
            </>
          }
          facts={
            <>
              <Fact value={posts.length} label={plural(posts.length, 'post')} />
              {words > 0 && <Fact value={words} label="minutes of reading" />}
              {posts[0] && <Fact label="latest" value={posts[0].publishedAt.slice(0, 10)} />}
            </>
          }
        />
        <section className="band">
          {posts.length === 0 ? (
            <p className="none">nothing published yet</p>
          ) : (
            <div className="post-grid">
              {posts.map((post) => (
                <PostCard key={post.id} post={post} />
              ))}
            </div>
          )}
        </section>
      </div>
    </Page>
  );
}
