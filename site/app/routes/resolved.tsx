import { data } from 'react-router';
import type { Route } from './+types/resolved';
import { hubContext } from '../context';
import { modelFrom } from '../hub';
import { loadMember, MemberPage } from '../pages/member-page';
import { loadProject, ProjectPage } from '../pages/project-page';
import { topicsFor } from '../topics';

export const handle = topicsFor('resolved', {
  reading: ({ loaderData }) => {
    const loaded = loaderData as { page?: string; slug?: string } | undefined;
    return loaded?.page === 'project' ? loaded.slug : undefined;
  },
});

export function loader({ context, params }: Route.LoaderArgs) {
  const hub = context.get(hubContext);
  const { project, member } = modelFrom(context).resolve(
    `/${[params.name, params.first, params.second].filter(Boolean).join('/')}`,
  );
  if (project) {
    return loadProject(hub, project);
  }
  if (member) {
    return loadMember(hub, member);
  }
  throw data(null, { status: 404 });
}

export default function Resolved({ loaderData }: Route.ComponentProps) {
  return loaderData.page === 'project' ? (
    <ProjectPage data={loaderData} />
  ) : (
    <MemberPage data={loaderData} />
  );
}
