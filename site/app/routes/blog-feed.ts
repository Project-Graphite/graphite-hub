import type { Route } from './+types/blog-feed';
import { hubContext } from '../context';
import { absolute, BUILT_AT } from '../meta';
import { createModel, publicDirectory } from '../model';

export function loader({ context, request }: Route.LoaderArgs) {
  const hub = context.get(hubContext);
  const model = createModel(publicDirectory(hub.directory));
  const isAtom = new URL(request.url).pathname.endsWith('/atom.xml');
  const posts = model.posts.slice(0, 30);
  const bodies = hub.posts.bodies(posts.map((post) => post.id));
  const entries = posts.flatMap((post) => {
    const author = model.memberByHandle(post.author);
    return author
      ? [
          {
            id: post.id,
            title: post.title,
            summary: post.summary,
            html: bodies.get(post.id) ?? '',
            url: absolute(post.path),
            publishedAt: post.publishedAt,
            updatedAt: post.updatedAt,
            author: { name: author.name, url: absolute(author.path) },
            tags: post.tags,
          },
        ]
      : [];
  });
  const source = {
    title: `${hub.settings['blog.title']} — ${hub.settings['site.name']}`,
    description: hub.settings['blog.intro'] || hub.settings['site.name'],
    siteUrl: absolute('/blog'),
    feedUrl: absolute(`/blog/${isAtom ? 'atom' : 'feed'}.xml`),
    builtAt: BUILT_AT,
    entries,
  };
  return new Response(isAtom ? hub.posts.atom(source) : hub.posts.rss(source), {
    headers: {
      'Content-Type': `application/${isAtom ? 'atom' : 'rss'}+xml; charset=utf-8`,
      'Cache-Control': 'public, max-age=300',
    },
  });
}
