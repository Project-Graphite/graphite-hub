import { redirect } from 'react-router';
import type { Route } from './+types/member';
import { hubContext } from '../context';
import { found, modelFrom } from '../hub';
import { loadMember, MemberPage } from '../pages/member-page';
import { topicsFor } from '../topics';

export const handle = topicsFor('member');

export function loader({ context, params }: Route.LoaderArgs) {
  const member = found(modelFrom(context).memberByHandle(params.handle));
  if (member.alias) {
    throw redirect(member.path, 301);
  }
  return loadMember(context.get(hubContext), member);
}

export default function Member({ loaderData }: Route.ComponentProps) {
  return <MemberPage data={loaderData} />;
}
