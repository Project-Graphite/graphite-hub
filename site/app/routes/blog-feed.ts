import type { Route } from './+types/blog-feed';
import { hubContext } from '../context';
import { ORIGIN } from '../meta';
import { createModel } from '../model';

export function loader({ context, request }: Route.LoaderArgs) {
  const hub = context.get(hubContext);
  const model = createModel(hub.directory);
  const isAtom = new URL(request.url).pathname.endsWith('/atom.xml');
  const entries = model.posts.slice(0, 30).flatMap((post) => {
    const author = model.memberByHandle(post.author);
    return author
      ? [
          {
            id: post.id,
            title: post.title,
            summary: post.summary,
            html: hub.posts.html(post.id) ?? '',
            url: `${ORIGIN}${post.path}/`,
            publishedAt: post.publishedAt,
            updatedAt: hub.posts.read(post.id)?.updatedAt ?? post.publishedAt,
            author: { name: author.name, url: `${ORIGIN}${author.path}/` },
            tags: post.tags,
          },
        ]
      : [];
  });
  const source = {
    title: `${hub.settings['blog.title']} — ${hub.settings['site.name']}`,
    description: hub.settings['blog.intro'] || hub.settings['site.name'],
    siteUrl: `${ORIGIN}/blog/`,
    feedUrl: `${ORIGIN}/blog/${isAtom ? 'atom' : 'feed'}.xml`,
    entries,
  };
  return new Response(isAtom ? hub.posts.atom(source) : hub.posts.rss(source), {
    headers: {
      'Content-Type': `application/${isAtom ? 'atom' : 'rss'}+xml; charset=utf-8`,
      'Cache-Control': 'public, max-age=300',
    },
  });
}
