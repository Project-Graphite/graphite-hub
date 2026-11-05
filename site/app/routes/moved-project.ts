import { redirect } from 'react-router';
import type { Route } from './+types/moved-project';
import { found, modelFrom } from '../hub';

export function loader({ context, params }: Route.LoaderArgs) {
  const project = found(modelFrom(context).projectByRoute(params.parentSlug, params.slug));
  return redirect(project.path, 301);
}
