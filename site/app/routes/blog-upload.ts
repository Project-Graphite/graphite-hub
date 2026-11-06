import { data } from 'react-router';
import type { Route } from './+types/blog-upload';
import { hubContext } from '../context';
import { checkedForm, member } from '../pages/blog';
import { isRefused, UPLOAD_LIMIT, uploadUrl } from '../profile';

export async function action({ context, request }: Route.ActionArgs) {
  const hub = context.get(hubContext);
  const { handle } = member(hub);
  if (Number(request.headers.get('content-length') ?? 0) > UPLOAD_LIMIT + 65_536) {
    return data({ error: 'Images are up to 5 MB.' }, { status: 413 });
  }
  const form = await checkedForm(hub, request);
  const file = form.get('file');
  if (!(file instanceof Blob)) {
    return data({ error: 'Choose an image.' }, { status: 400 });
  }
  try {
    const id = await hub.uploads.store(handle, 'post', file);
    return { id, url: uploadUrl(id, 'post') };
  } catch (error) {
    if (isRefused(error)) {
      return data({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}

export function loader() {
  throw data(null, { status: 404 });
}
