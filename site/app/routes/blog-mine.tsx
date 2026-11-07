import { useState } from 'react';
import { data, Link, useFetcher } from 'react-router';
import type { Route } from './+types/blog-mine';
import { accentStyle, Avatar, Button } from '../components/kit/basics';
import { Confirm, Segmented } from '../components/kit/controls';
import { Fact, PageHeader } from '../components/kit/page';
import { Page } from '../components/Shell';
import { hubContext } from '../context';
import { day } from '../format';
import { useHub, useRoot } from '../hub';
import { checkedForm, EDITOR_PATH, member, viewerHandle } from '../pages/blog';
import { postPath, STATUS_LABEL, type PostStatus } from '../posts';
import { isRefused } from '../profile';
import { topicsFor } from '../topics';

export const handle = topicsFor('blog-mine');

export function loader({ context }: Route.LoaderArgs) {
  const hub = context.get(hubContext);
  const { handle, owner } = member(hub);
  return {
    handle,
    owner,
    posts: hub.posts.byAuthor(owner ? null : handle).map((post) => ({
      id: post.id,
      slug: post.slug,
      title: post.title,
      author: post.author,
      status: post.status,
      publishAt: post.publishAt,
      publishedAt: post.publishedAt,
      updatedAt: post.updatedAt,
      trashedAt: post.trashedAt,
      manage: hub.posts.accessTo(post, { handle, owner }).manage,
    })),
  };
}

export async function action({ context, request }: Route.ActionArgs) {
  const hub = context.get(hubContext);
  const { handle, owner } = member(hub);
  const form = await checkedForm(hub, request);
  const id = String(form.get('id') ?? '');
  const post = hub.posts.read(id);
  if (!post || !hub.posts.accessTo(post, { handle, owner }).manage) {
    throw data(null, { status: 404 });
  }
  try {
    switch (form.get('intent')) {
      case 'trash':
        await hub.posts.trash(id, viewerHandle(hub) ?? handle);
        break;
      case 'restore':
        await hub.posts.restore(id, handle);
        break;
      case 'remove':
        await hub.posts.remove(id, handle);
        break;
      case 'unpublish':
        await hub.posts.unpublish(id, handle);
        break;
    }
  } catch (error) {
    if (isRefused(error)) {
      return data({ error: error.message }, { status: 400 });
    }
    throw error;
  }
  return { ok: true };
}

const FILTERS = [
  ['all', 'all'],
  ['draft', 'drafts'],
  ['scheduled', 'scheduled'],
  ['published', 'published'],
  ['trashed', 'trash'],
] as const;

type Filter = (typeof FILTERS)[number][0];

export default function BlogMine({ loaderData }: Route.ComponentProps) {
  const hub = useHub();
  const csrf = useRoot()!.csrf ?? '';
  const fetcher = useFetcher<{ ok?: boolean; error?: string }>();
  const [filter, setFilter] = useState<Filter>('all');
  const posts = loaderData.posts.filter((post) => filter === 'all' || post.status === filter);
  const count = (status: PostStatus) =>
    loaderData.posts.filter((post) => post.status === status).length;
  const act = (intent: string, id: string) =>
    fetcher.submit({ csrf, intent, id }, { method: 'post' });

  return (
    <Page>
      <div className="blog mine">
        <PageHeader
          path="/blog/mine"
          title={loaderData.owner ? 'Every post' : 'Your posts'}
          actions={
            <>
              <Button to="/blog/new" primary arrow>
                write
              </Button>
              <Button to="/blog">the blog</Button>
            </>
          }
          facts={
            <>
              <Fact value={count('draft')} label="drafts" />
              <Fact value={count('scheduled')} label="scheduled" />
              <Fact value={count('published')} label="published" />
            </>
          }
        >
          <div className="mt-5">
            <Segmented
              label="Show"
              options={FILTERS}
              value={filter}
              choose={(next) => setFilter(next)}
            />
          </div>
        </PageHeader>

        <section className="band">
          {fetcher.data?.error && <p className="text-danger mono-sm">{fetcher.data.error}</p>}
          {posts.length === 0 ? (
            <p className="none">nothing here</p>
          ) : (
            <ol className="desk">
              {posts.map((post) => {
                const author = hub.memberByHandle(post.author);
                const publicPath = author && postPath(author.path, post.slug);
                const when =
                  post.status === 'scheduled' && post.publishAt
                    ? `publishes ${day(post.publishAt)} ${post.publishAt.slice(11, 16)} UTC`
                    : post.status === 'published' && post.publishedAt
                      ? `published ${day(post.publishedAt)}`
                      : post.status === 'trashed' && post.trashedAt
                        ? `trashed ${day(post.trashedAt)} · kept 30 days`
                        : `edited ${day(post.updatedAt)}`;
                return (
                  <li key={post.id} style={accentStyle(author?.accent)} data-status={post.status}>
                    <span className="state" data-status={post.status}>
                      {STATUS_LABEL[post.status]}
                    </span>
                    <span className="what">
                      <Link to={post.status === 'trashed' ? '#' : EDITOR_PATH(post.id)}>
                        <strong>{post.title || 'Untitled'}</strong>
                      </Link>
                      <span className="when">
                        {loaderData.owner && author && (
                          <span className="by">
                            <Avatar member={author} size="xs" />
                            {author.name}
                          </span>
                        )}
                        {when}
                      </span>
                    </span>
                    <span className="tools">
                      {post.status !== 'trashed' && (
                        <Link to={EDITOR_PATH(post.id)} className="chip-button">
                          edit
                        </Link>
                      )}
                      {publicPath && post.status !== 'trashed' && (
                        <Link to={publicPath} className="chip-button">
                          {post.status === 'published' ? 'view' : 'preview'}
                        </Link>
                      )}
                      {post.manage && post.status === 'published' && (
                        <Confirm label="unpublish" act={() => act('unpublish', post.id)} />
                      )}
                      {post.manage && post.status !== 'trashed' && (
                        <Confirm label="trash" act={() => act('trash', post.id)} />
                      )}
                      {post.manage && post.status === 'trashed' && (
                        <>
                          <button
                            type="button"
                            className="chip-button"
                            onClick={() => act('restore', post.id)}
                          >
                            restore
                          </button>
                          <Confirm
                            label="delete"
                            sure="for good?"
                            act={() => act('remove', post.id)}
                          />
                        </>
                      )}
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      </div>
    </Page>
  );
}
