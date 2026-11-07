import { data, Link, redirect } from 'react-router';
import type { Route } from './+types/post';
import { accentStyle, Avatar, Button, Cover, Panel } from '../components/kit/basics';
import { EditingBadge, ReadingBadge } from '../components/kit/live';
import { Fact, PageHeader } from '../components/kit/page';
import { PostRow } from '../components/kit/posts';
import { WindowBar } from '../components/kit/projects';
import { SubscribePanel } from '../components/kit/subscribe';
import { Page } from '../components/Shell';
import TagList from '../components/TagList';
import { hubContext } from '../context';
import { day } from '../format';
import { useHub, useRoot } from '../hub';
import { useView, useViews } from '../live';
import { createModel } from '../model';
import { accessTo, authorFrom, EDITOR_PATH } from '../pages/blog';
import { uploadUrl } from '../profile';
import { topicsFor, type KeyedMatch } from '../topics';

const postId = ({ loaderData }: KeyedMatch) =>
  (loaderData as { post?: { id: string } } | undefined)?.post?.id;

export const handle = topicsFor('post', { reading: postId, editing: postId });

const HEADING = /<h([23]) id="([^"]*)"[^>]*>([\s\S]*?)<\/h\1>/g;

export function loader({ context, params }: Route.LoaderArgs) {
  const hub = context.get(hubContext);
  const author = authorFrom(hub, params);
  if (params.handle && author.alias) {
    throw redirect(`${author.path}/blog/${params.slug}`, 301);
  }
  const post = hub.posts.bySlug(author.handle, params.slug);
  const access = post && accessTo(hub, post);
  if (!post || post.status === 'trashed' || (post.status !== 'published' && !access?.edit)) {
    throw data(null, { status: 404 });
  }
  const published = post.status === 'published';
  const html = published ? (hub.posts.html(post.id) ?? '') : hub.posts.preview(post.id).html;
  const model = createModel(hub.directory);
  const mine = model.postsBy(author);
  const index = mine.findIndex((entry) => entry.id === post.id);
  return {
    reading: hub.presence.reading(post.id),
    editing: hub.collab
      .editing(post.id)
      .map(({ handle, name, color }) => ({ handle, name, color })),
    post: {
      id: post.id,
      slug: post.slug,
      title: post.title || 'Untitled',
      summary: post.summary,
      tags: post.tags,
      project: post.project,
      coverUrl: post.coverUpload ? uploadUrl(post.coverUpload, 'cover') : null,
      status: post.status,
      publishAt: post.publishAt,
      publishedAt: post.publishedAt,
      readingMinutes: post.readingMinutes ?? 1,
      updatedAt: post.updatedAt,
    },
    author: author.handle,
    html,
    headings: [...html.matchAll(HEADING)].map(([, level, id, text]) => ({
      level: Number(level),
      id,
      text: text.replace(/<[^>]+>/g, ''),
    })),
    editable: Boolean(access?.edit),
    previous: index >= 0 ? (mine[index + 1] ?? null) : null,
    next: index > 0 ? mine[index - 1] : null,
  };
}

export const links = () => [
  { rel: 'alternate', type: 'application/rss+xml', title: 'RSS', href: '/blog/feed.xml' },
];

export default function Post({ loaderData }: Route.ComponentProps) {
  const hub = useHub();
  const { post, html, headings, editable, previous, next } = loaderData;
  const author = hub.memberByHandle(loaderData.author)!;
  const project = post.project ? hub.projectBySlug(post.project) : undefined;
  const owner = project ? hub.memberByHandle(project.owner) : undefined;
  const more = hub.postsBy(author).filter((entry) => entry.id !== post.id);
  const draft = post.status !== 'published';
  const views = useViews(useRoot()!.views)('post', post.id);
  useView('post', post.id);

  return (
    <Page
      rail={
        <>
          {headings.length > 1 && (
            <Panel title="on this page">
              <ol className="mono-sm grid gap-1.5 headings">
                {headings.map((heading) => (
                  <li key={heading.id} data-level={heading.level}>
                    <a href={`#${heading.id}`} className="text-muted hover:text-ink">
                      {heading.text}
                    </a>
                  </li>
                ))}
              </ol>
            </Panel>
          )}
          {project && (
            <Panel title="about">
              <div className="window mini" style={accentStyle(project.accent ?? owner?.accent)}>
                <WindowBar project={project} />
                <Link to={project.path} className="face">
                  <Cover
                    name={project.name}
                    seed={project.slug}
                    accent={project.accent ?? owner?.accent ?? ''}
                    image={project.coverUrl}
                  />
                  <span className="body">
                    <strong>{project.name}</strong>
                    <span>{project.summary}</span>
                  </span>
                </Link>
              </div>
            </Panel>
          )}
          {more.length > 0 && (
            <Panel
              title={`more by ${author.name.split(' ')[0]}`}
              link={{ to: `${author.path}/blog`, label: 'all' }}
            >
              <div className="post-rows">
                {more.slice(0, 5).map((entry) => (
                  <PostRow key={entry.id} post={entry} />
                ))}
              </div>
            </Panel>
          )}
          {!draft && (
            <SubscribePanel
              scope={{ kind: 'member', handle: author.handle }}
              title={`follow ${author.name.split(' ')[0]}`}
            />
          )}
        </>
      }
    >
      <article className="blog post profile" style={accentStyle(author.accent)}>
        <PageHeader
          banner={post.coverUrl && <img className="member-cover" src={post.coverUrl} alt="" />}
          path={
            <>
              <Link to={author.path} className="hover:text-ink hover:underline">
                {author.path}
              </Link>
              /
              <Link to={`${author.path}/blog`} className="hover:text-ink hover:underline">
                blog
              </Link>
              /{post.slug}
              {draft && <span className="state">{post.status}</span>}
            </>
          }
          lead={
            <Link to={author.path} aria-label={author.name}>
              <Avatar member={author} size="lg" />
            </Link>
          }
          title={post.title}
          aside={
            <>
              <ReadingBadge id={post.id} initial={loaderData.reading} />
              <EditingBadge id={post.id} initial={loaderData.editing} />
            </>
          }
          subtitle={post.summary}
          actions={
            editable && (
              <Button to={EDITOR_PATH(post.id)} primary>
                edit
              </Button>
            )
          }
          facts={
            <>
              <Fact
                label="by"
                value={
                  <Link to={`${author.path}/blog`} className="hover:underline">
                    {author.name}
                  </Link>
                }
              />
              {post.publishedAt && !draft && (
                <Fact
                  label="published"
                  value={<time dateTime={post.publishedAt}>{day(post.publishedAt)}</time>}
                />
              )}
              {draft && (
                <Fact
                  label={post.status === 'scheduled' ? 'publishes' : 'status'}
                  value={post.publishAt ? day(post.publishAt) : post.status}
                />
              )}
              <Fact value={post.readingMinutes} label="min read" />
              {views > 0 && <Fact value={views} label={views === 1 ? 'view' : 'views'} />}
            </>
          }
        >
          {post.tags.length > 0 && <TagList tags={post.tags} className="mt-4.5" />}
        </PageHeader>

        <div className="prose" dangerouslySetInnerHTML={{ __html: html }} />

        {(previous || next) && (
          <nav className="neighbours" aria-label="More posts">
            {previous ? (
              <Link to={previous.path} className="neighbour prev">
                <span className="mono-sm text-faint">← earlier</span>
                <strong>{previous.title}</strong>
              </Link>
            ) : (
              <span />
            )}
            {next && (
              <Link to={next.path} className="neighbour next">
                <span className="mono-sm text-faint">later →</span>
                <strong>{next.title}</strong>
              </Link>
            )}
          </nav>
        )}
      </article>
    </Page>
  );
}
