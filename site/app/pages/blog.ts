import { data } from 'react-router';
import type { Hub } from '../context';
import { createModel } from '../model';
import type { Post } from '../posts';
import type { Member } from '../types';

export function viewerHandle(hub: Hub) {
  const viewer = hub.viewer;
  if (!viewer) {
    return null;
  }
  return createModel(hub.directory).memberByGithub(viewer.login)?.handle ?? null;
}

export function member(hub: Hub) {
  const handle = viewerHandle(hub);
  if (!handle || !hub.viewer) {
    throw data(null, { status: 404 });
  }
  return { handle, owner: hub.viewer.owner };
}

export function authorFrom(hub: Hub, params: { handle?: string; alias?: string }): Member {
  const model = createModel(hub.directory);
  const found = params.handle
    ? model.memberByHandle(params.handle)
    : model.resolve(`/${params.alias}`).member;
  if (!found) {
    throw data(null, { status: 404 });
  }
  return found;
}

export function accessTo(hub: Hub, post: Post) {
  return hub.posts.accessTo(post, { handle: viewerHandle(hub), owner: hub.viewer?.owner ?? false });
}

export function editablePost(hub: Hub, id: string) {
  const post = hub.posts.read(id);
  const access = post && accessTo(hub, post);
  if (!post || !access?.edit) {
    throw data(null, { status: 404 });
  }
  return { post, access, by: viewerHandle(hub) ?? hub.viewer!.login };
}

export async function checkedForm(hub: Hub, request: Request) {
  if (request.headers.get('origin') !== hub.origin) {
    throw data(null, { status: 403 });
  }
  const form = await request.formData();
  if (form.get('csrf') !== hub.csrf) {
    throw data(null, { status: 403 });
  }
  return form;
}

export const EDITOR_PATH = (id: string) => `/blog/${id}/edit`;
