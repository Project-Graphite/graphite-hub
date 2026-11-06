import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import type { Route } from './+types/blog';
import { accentStyle, Avatar, Button, Panel } from '../components/kit/basics';
import { Chips } from '../components/kit/directory';
import { Editable } from '../components/kit/Editable';
import { Console } from '../components/kit/live';
import { Fact, PageHeader } from '../components/kit/page';
import { PostCard, WritingStrip } from '../components/kit/posts';
import { SubscribePanel } from '../components/kit/subscribe';
import { Page } from '../components/Shell';
import { hubContext } from '../context';
import { useHub, useRoot } from '../hub';
import { viewerHandle } from '../pages/blog';

export const handle = { topics: ['posts', 'members', 'projects'] };

export function loader({ context }: Route.LoaderArgs) {
  const hub = context.get(hubContext);
  return {
    lines: hub.reads.consoleLines(hub.settings['rail.console.lines']),
    writer: viewerHandle(hub) !== null,
    month: hub.directory.posts.filter(
      (post) => Date.now() - Date.parse(post.publishedAt) < 30 * 86_400_000,
    ).length,
  };
}

export const links = () => [
  { rel: 'alternate', type: 'application/rss+xml', title: 'RSS', href: '/blog/feed.xml' },
  { rel: 'alternate', type: 'application/atom+xml', title: 'Atom', href: '/blog/atom.xml' },
];

export default function Blog({ loaderData }: Route.ComponentProps) {
  const hub = useHub();
  const settings = useRoot()!.settings;
  const [params, setParams] = useSearchParams();
  const [shown, setShown] = useState(settings['blog.page.count']);
  const author = params.get('author') ?? '';
  const project = params.get('project') ?? '';
  const tag = params.get('tag') ?? '';
  const pick = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) {
      next.set(key, value);
    } else {
      next.delete(key);
    }
    setParams(next, { replace: true, preventScrollReset: true });
  };
  const posts = hub.posts.filter(
    (post) =>
      (!author || post.author === author) &&
      (!project || post.project === project) &&
      (!tag || post.tags.includes(tag)),
  );
  const filtering = Boolean(author || project || tag);
  const writers = hub.members
    .map((member) => ({ member, count: hub.postsBy(member).length }))
    .filter((entry) => entry.count > 0);
  const projects = hub.projects
    .map((entry) => ({ project: entry, count: hub.postsAbout(entry).length }))
    .filter((entry) => entry.count > 0);
  const tags = [...new Set(hub.posts.flatMap((post) => post.tags))]
    .map((name) => ({ name, count: hub.posts.filter((post) => post.tags.includes(name)).length }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  const month = loaderData.month;

  return (
    <Page
      rail={
        <>
          <SubscribePanel scope={{ kind: 'all' }} />
          {writers.length > 0 && (
            <Panel title="writers">
              <div className="panel-list">
                {writers.map(({ member, count }) => (
                  <Link key={member.handle} to={`${member.path}/blog`}>
                    <Avatar member={member} size="md" />
                    <span>
                      <strong>{member.name}</strong>
                      <span className="headline">{member.headline ?? `@${member.github}`}</span>
                    </span>
                    <span className="count">{count}</span>
                  </Link>
                ))}
              </div>
            </Panel>
          )}
          {tags.length > 0 && (
            <Panel title="tags">
              <div className="chips">
                {tags.map((entry) => (
                  <button
                    key={entry.name}
                    type="button"
                    aria-pressed={tag === entry.name}
                    onClick={() => pick('tag', tag === entry.name ? '' : entry.name)}
                  >
                    {entry.name}
                    <b>{entry.count}</b>
                  </button>
                ))}
              </div>
            </Panel>
          )}
          <Console
            initial={loaderData.lines}
            limit={settings['rail.console.lines']}
            link={{ to: '/status', label: 'status' }}
          />
        </>
      }
    >
      <div className="blog">
        <PageHeader
          path="/blog"
          title={<Editable setting="blog.title" />}
          subtitle={<Editable setting="blog.intro" />}
          actions={
            <>
              {loaderData.writer && (
                <Button to="/blog/new" primary arrow>
                  write
                </Button>
              )}
              {loaderData.writer && <Button to="/blog/mine">your posts</Button>}
              <Button to="/subscribe">subscribe</Button>
              <Button to="/blog/feed.xml">rss</Button>
            </>
          }
          facts={
            <>
              <Fact value={hub.posts.length} label="posts" />
              <Fact value={writers.length} label="writers" />
              {month > 0 && <Fact value={month} label="this month" />}
            </>
          }
        />

        {!filtering && hub.posts.length > 1 && (
          <section className="band latest">
            <WritingStrip
              posts={hub.posts.slice(0, settings['blog.filmstrip.count'])}
              label="latest posts"
            />
          </section>
        )}

        <section className="band">
          {hub.posts.length > 0 && (
            <div className="filters">
              <div className="writers" role="group" aria-label="Filter by writer">
                <button
                  type="button"
                  className="chip-button"
                  aria-pressed={author === ''}
                  onClick={() => pick('author', '')}
                >
                  everyone
                </button>
                {writers.map(({ member }) => (
                  <button
                    key={member.handle}
                    type="button"
                    className="face-pick"
                    aria-pressed={author === member.handle}
                    aria-label={member.name}
                    style={accentStyle(member.accent)}
                    onClick={() => pick('author', author === member.handle ? '' : member.handle)}
                  >
                    <Avatar member={member} size="sm" />
                  </button>
                ))}
              </div>
              {projects.length > 0 && (
                <Chips
                  label="Filter by project"
                  value={project}
                  onChange={(id) => pick('project', id === project ? '' : id)}
                  choices={projects.map(({ project: entry, count }) => ({
                    id: entry.slug,
                    label: entry.name,
                    count,
                  }))}
                />
              )}
            </div>
          )}
          {posts.length === 0 ? (
            <p className="none">nothing written here yet</p>
          ) : (
            <div className="post-grid">
              {posts.slice(0, shown).map((post) => (
                <PostCard key={post.id} post={post} />
              ))}
            </div>
          )}
          {posts.length > shown && (
            <div className="more-row">
              <button
                type="button"
                className="chip-button"
                onClick={() => setShown(shown + settings['blog.page.count'])}
              >
                {posts.length - shown} more
              </button>
            </div>
          )}
        </section>
      </div>
    </Page>
  );
}
