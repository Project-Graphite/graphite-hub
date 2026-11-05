import { data, redirect } from 'react-router';
import type { Route } from './+types/go';
import { hubContext } from '../context';

export function loader({ context, params }: Route.LoaderArgs) {
  const { profiles } = context.get(hubContext);
  const owner = profiles.handleForAlias(params.alias);
  const url = owner && profiles.shortLink(owner, params.link);
  if (!url) {
    throw data(null, { status: 404 });
  }
  return redirect(url, 302);
}
