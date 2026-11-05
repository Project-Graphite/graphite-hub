import { data } from 'react-router';
import type { Route } from './+types/resolved';
import { hubContext } from '../context';
import { modelFrom } from '../hub';
import { loadMember, MEMBER_TOPICS, MemberPage } from '../pages/member-page';
import { loadProject, PROJECT_TOPICS, ProjectPage } from '../pages/project-page';

export const handle = { topics: [...new Set([...PROJECT_TOPICS, ...MEMBER_TOPICS])] };

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
