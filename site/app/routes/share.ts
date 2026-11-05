import { data } from 'react-router';
import type { Route } from './+types/share';
import { hubContext } from '../context';
import { modelFrom } from '../hub';
import { shareCard, shareHash } from '../share';

export async function loader({ context, params, request }: Route.LoaderArgs) {
  const hub = context.get(hubContext);
  const path = `/${params['*'].replace(/\.png$/, '')}`.replace(/^\/home$/, '/');
  const card = shareCard(
    modelFrom(context),
    path,
    hub.settings['home.hero.headline'],
    hub.settings['site.accents'],
  );
  if (!card) {
    throw data(null, { status: 404 });
  }
  const current = new URL(request.url).searchParams.get('v') === shareHash(card);
  return new Response(new Uint8Array(await hub.share(card)), {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': current ? 'public, max-age=31536000, immutable' : 'public, max-age=300',
    },
  });
}
