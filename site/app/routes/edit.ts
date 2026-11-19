import { data } from 'react-router';
import type { Route } from './+types/edit';
import { hubContext, type Hub } from '../context';
import { checkedForm } from '../pages/blog';
import { isUploadKind, UPLOAD_LIMIT } from '../profile';

function parsed(value: FormDataEntryValue | null): unknown {
  try {
    return JSON.parse(String(value));
  } catch {
    return undefined;
  }
}

export function loader({ context, pattern, url }: Route.LoaderArgs) {
  const hub = context.get(hubContext);
  const versions =
    pattern === 'edit/history'
      ? hub.edit.history(url.searchParams.getAll('target').map(parsed), hub.viewer)
      : null;
  if (!versions) {
    throw data(null, { status: 404 });
  }
  return { versions };
}

function run({ edit, viewer }: Hub, step: string, form: FormData) {
  switch (step) {
    case 'edit':
      return edit.apply(parsed(form.get('patch')), viewer);
    case 'edit/restore':
      return edit.restore(Number(form.get('version')), viewer);
    case 'edit/upload': {
      const kind = form.get('kind');
      const file = form.get('file');
      return isUploadKind(kind) && file instanceof Blob
        ? edit.upload(parsed(form.get('target')), kind, file, viewer)
        : { ok: false as const, error: 'Choose an image.' };
    }
    default:
      return null;
  }
}

export async function action({ context, pattern, request }: Route.ActionArgs) {
  const hub = context.get(hubContext);
  if (!hub.viewer) {
    throw data(null, { status: 404 });
  }
  if (Number(request.headers.get('content-length') ?? 0) > UPLOAD_LIMIT + 65_536) {
    return data({ ok: false, error: 'Images are up to 5 MB.' }, { status: 413 });
  }
  const result = await run(hub, pattern, await checkedForm(hub, request));
  if (!result) {
    throw data(null, { status: 404 });
  }
  return 'ok' in result && !result.ok ? data(result, { status: 400 }) : result;
}
