import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { data, Link, redirect, useFetcher } from 'react-router';
import type { Route } from './+types/post-editor';
import { accentStyle, Avatar, Button } from '../components/kit/basics';
import { Confirm, Segmented } from '../components/kit/controls';
import { Fact } from '../components/kit/page';
import { Page } from '../components/Shell';
import { hubContext } from '../context';
import type { EditorReport } from '../editor/PostEditor';
import { day } from '../format';
import { useHub, useRoot } from '../hub';
import { Field } from '../motion/canvases';
import { checkedForm, editablePost, viewerHandle } from '../pages/blog';
import { POST_LIMITS, postPath, slugify, STATUS_LABEL, type PostFields } from '../posts';
import { isRefused, uploadUrl } from '../profile';

export const handle = { topics: ['posts', 'members', 'projects'] };

const PostEditor = lazy(() => import('../editor/PostEditor'));

export function loader({ context, params }: Route.LoaderArgs) {
  const hub = context.get(hubContext);
  const { post, access } = editablePost(hub, params.id);
  if (post.status === 'trashed') {
    throw redirect('/blog/mine');
  }
  return {
    post,
    access,
    handle: viewerHandle(hub) ?? hub.viewer!.login,
    versions: hub.posts.versions(post.id),
    templates: hub.posts.templates(viewerHandle(hub) ?? ''),
  };
}

export async function action({ context, params, request }: Route.ActionArgs) {
  const hub = context.get(hubContext);
  const { post, access, by } = editablePost(hub, params.id);
  const form = await checkedForm(hub, request);
  const intent = String(form.get('intent') ?? '');
  const manageOnly = ['publish', 'schedule', 'unschedule', 'unpublish', 'trash'];
  if (manageOnly.includes(intent) && !access.manage) {
    throw data(null, { status: 404 });
  }
  const { posts, collab } = hub;
  try {
    switch (intent) {
      case 'save':
        await posts.save(post.id, JSON.parse(String(form.get('fields'))), by);
        break;
      case 'publish':
        await posts.publish(post.id, by);
        break;
      case 'schedule':
        await posts.schedule(post.id, String(form.get('at') ?? ''), by);
        break;
      case 'unschedule':
      case 'unpublish':
        await posts.unpublish(post.id, by);
        break;
      case 'trash':
        await posts.trash(post.id, by);
        throw redirect('/blog/mine');
      case 'keep':
        await posts.keep(post.id, by, String(form.get('label') ?? '').trim() || null);
        break;
      case 'restore': {
        const version = Number(form.get('version'));
        await collab.replace(post.id, posts.versionContent(post.id, version));
        await posts.restored(post.id, version, by);
        break;
      }
      case 'template':
        await posts.saveTemplate(post.id, String(form.get('name') ?? ''), by);
        break;
      case 'remove-template':
        posts.removeTemplate(String(form.get('template') ?? ''), by);
        break;
    }
  } catch (error) {
    if (isRefused(error)) {
      return data({ error: error.message }, { status: 400 });
    }
    throw error;
  }
  return { ok: true };
}

type Result = { ok?: boolean; error?: string };

const TABS = [
  ['post', 'post'],
  ['people', 'people'],
  ['versions', 'versions'],
  ['more', 'more'],
] as const;

function Row({
  label,
  group = false,
  children,
}: {
  label: string;
  group?: boolean;
  children: ReactNode;
}) {
  const Tag = group ? 'div' : 'label';
  return (
    <Tag className="editor-field">
      <span>{label}</span>
      {children}
    </Tag>
  );
}

function SaveState({ state, error }: { state: 'saving' | 'saved' | 'error'; error?: string }) {
  return (
    <span className="setting-state" data-state={state}>
      <i />
      {state === 'error' ? error : state}
    </span>
  );
}

function localDateTime(iso: string | null) {
  const date = iso ? new Date(iso) : new Date(Date.now() + 3_600_000);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function PostEditorRoute({ loaderData }: Route.ComponentProps) {
  const { post, access, versions, templates } = loaderData;
  const root = useRoot()!;
  const hub = useHub();
  const csrf = root.csrf ?? '';
  const me = hub.memberByHandle(loaderData.handle);
  const author = hub.memberByHandle(post.author);
  const save = useFetcher<Result>();
  const act = useFetcher<Result>();
  const [tab, setTab] = useState<(typeof TABS)[number][0]>('post');
  const [draft, setDraft] = useState<PostFields>(post);
  const [slugTouched, setSlugTouched] = useState(
    post.slug !== slugify(post.title) && post.title !== '',
  );
  const [dirty, setDirty] = useState(false);
  const [report, setReport] = useState<EditorReport>({
    connection: 'connecting',
    words: 0,
    minutes: 1,
    peers: [],
  });
  const [when, setWhen] = useState('');
  const [label, setLabel] = useState('');
  const [templateName, setTemplateName] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const hydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const [synced, setSynced] = useState(post.updatedAt);
  if (post.updatedAt !== synced) {
    setSynced(post.updatedAt);
    if (!dirty && save.state === 'idle') {
      setDraft(post);
    }
  }
  useEffect(() => () => clearTimeout(timer.current), []);

  const change = (next: PostFields, delay = 700) => {
    setDraft(next);
    setDirty(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setDirty(false);
      void save.submit({ csrf, intent: 'save', fields: JSON.stringify(next) }, { method: 'post' });
    }, delay);
  };
  const title = (value: string) =>
    change({ ...draft, title: value, slug: slugTouched ? draft.slug : slugify(value) });
  const run = (intent: string, extra: Record<string, string> = {}) =>
    act.submit({ csrf, intent, ...extra }, { method: 'post' });
  const state = dirty || save.state !== 'idle' ? 'saving' : save.data?.error ? 'error' : 'saved';
  const upload = async (file: File) => {
    const form = new FormData();
    form.set('csrf', csrf);
    form.set('file', file);
    const response = await fetch('/blog/upload', { method: 'POST', body: form });
    const body = (await response.json()) as { url?: string };
    return body.url ?? null;
  };
  const uploadCover = async (file: File) => {
    const url = await upload(file);
    const id = url?.split('/')[2];
    if (id) {
      change({ ...draft, coverUpload: id }, 0);
    }
  };
  const published = post.status === 'published';
  const publicPath = author && postPath(author.path, post.slug);
  const projects = hub.projects.filter((project) => project.kind === 'project');
  const live = {
    connecting: 'connecting',
    online: 'live',
    offline: 'offline · kept on this device',
    refused: 'read only',
  }[report.connection];

  return (
    <Page
      rail={
        <aside className="inspector editor-side">
          <div className="inspector-head">
            {author && <Avatar member={author} size="sm" />}
            <span className="who">
              <strong>{STATUS_LABEL[post.status]}</strong>
              {publicPath && <Link to={publicPath}>{published ? 'view the post' : 'preview'}</Link>}
            </span>
            <SaveState state={state} error={save.data?.error} />
          </div>
          <div className="tabs">
            <Segmented label="Section" options={TABS} value={tab} choose={setTab} />
          </div>
          <div className="inspector-body" key={tab}>
            {tab === 'post' && (
              <div className="grid gap-5">
                <Row label="address">
                  <input
                    className="field"
                    value={draft.slug}
                    maxLength={POST_LIMITS.slug}
                    onChange={(event) => {
                      setSlugTouched(true);
                      change({ ...draft, slug: slugify(event.target.value) || draft.slug });
                    }}
                  />
                </Row>
                <Row label="summary">
                  <textarea
                    className="field"
                    value={draft.summary}
                    maxLength={POST_LIMITS.summary}
                    onChange={(event) => change({ ...draft, summary: event.target.value })}
                  />
                </Row>
                <Row label="tags">
                  <input
                    className="field"
                    value={draft.tags.join(', ')}
                    placeholder="comma, separated"
                    onChange={(event) =>
                      change({
                        ...draft,
                        tags: [
                          ...new Set(
                            event.target.value
                              .split(',')
                              .map((tag) => tag.trim().toLowerCase())
                              .filter(Boolean),
                          ),
                        ].slice(0, POST_LIMITS.tags),
                      })
                    }
                  />
                </Row>
                <Row label="about a project">
                  <select
                    className="field"
                    value={draft.project ?? ''}
                    onChange={(event) =>
                      change({ ...draft, project: event.target.value || null }, 0)
                    }
                  >
                    <option value="">none</option>
                    {projects.map((project) => (
                      <option key={project.slug} value={project.slug}>
                        {project.name}
                      </option>
                    ))}
                  </select>
                </Row>
                <Row label="cover">
                  <div className="editor-row">
                    {draft.coverUpload ? (
                      <img
                        className="thumb"
                        src={uploadUrl(draft.coverUpload, 'post', 'small')}
                        alt=""
                      />
                    ) : (
                      <span className="thumb empty" />
                    )}
                    <label className="chip-button">
                      upload
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/gif"
                        hidden
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) {
                            void uploadCover(file);
                          }
                          event.target.value = '';
                        }}
                      />
                    </label>
                    {draft.coverUpload && (
                      <button
                        type="button"
                        className="chip-button"
                        onClick={() => change({ ...draft, coverUpload: null }, 0)}
                      >
                        remove
                      </button>
                    )}
                  </div>
                </Row>
                {access.manage && (
                  <div className="publishing">
                    {act.data?.error && <p className="text-danger mono-sm">{act.data.error}</p>}
                    {post.status === 'draft' && (
                      <>
                        <button
                          type="button"
                          className="btn primary"
                          disabled={act.state !== 'idle'}
                          onClick={() => run('publish')}
                        >
                          publish now
                        </button>
                        <div className="editor-row">
                          <input
                            className="field grow"
                            type="datetime-local"
                            value={when || (hydrated ? localDateTime(post.publishAt) : '')}
                            onChange={(event) => setWhen(event.target.value)}
                          />
                          <button
                            type="button"
                            className="chip-button"
                            disabled={act.state !== 'idle'}
                            onClick={() => run('schedule', { at: new Date(when).toISOString() })}
                          >
                            schedule
                          </button>
                        </div>
                      </>
                    )}
                    {post.status === 'scheduled' && post.publishAt && (
                      <>
                        <p className="mono-sm text-muted">
                          publishes {day(post.publishAt)} at{' '}
                          {hydrated
                            ? new Date(post.publishAt).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                              })
                            : `${post.publishAt.slice(11, 16)} UTC`}
                        </p>
                        <div className="editor-row">
                          <button
                            type="button"
                            className="btn primary"
                            onClick={() => run('publish')}
                          >
                            publish now
                          </button>
                          <button
                            type="button"
                            className="chip-button"
                            onClick={() => run('unschedule')}
                          >
                            back to draft
                          </button>
                        </div>
                      </>
                    )}
                    {published && post.publishedAt && (
                      <div className="editor-row">
                        <span className="mono-sm text-muted grow">
                          published {day(post.publishedAt)}
                        </span>
                        <Confirm label="unpublish" act={() => run('unpublish')} />
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
            {tab === 'people' && (
              <div className="grid gap-5">
                <Row label="here now">
                  <div className="peers">
                    {me && (
                      <span className="peer" style={accentStyle(me.accent)}>
                        <Avatar member={me} size="sm" />
                        you
                      </span>
                    )}
                    {report.peers.map((peer) => {
                      const member = hub.memberByHandle(peer.handle);
                      return (
                        <span
                          key={peer.handle}
                          className="peer"
                          style={{ '--accent': peer.color } as never}
                        >
                          {member ? (
                            <Avatar member={member} size="sm" />
                          ) : (
                            <span className="avatar sm" />
                          )}
                          {peer.name}
                        </span>
                      );
                    })}
                  </div>
                </Row>
                <Row label="may edit this post">
                  <div className="chips">
                    {hub.members
                      .filter((member) => member.handle !== post.author)
                      .map((member) => {
                        const on = draft.editors.includes(member.handle);
                        return (
                          <button
                            key={member.handle}
                            type="button"
                            aria-pressed={on}
                            disabled={!access.manage}
                            onClick={() =>
                              change(
                                {
                                  ...draft,
                                  editors: on
                                    ? draft.editors.filter((handle) => handle !== member.handle)
                                    : [...draft.editors, member.handle],
                                },
                                0,
                              )
                            }
                          >
                            {member.name}
                          </button>
                        );
                      })}
                  </div>
                </Row>
              </div>
            )}
            {tab === 'versions' && (
              <div className="grid gap-4">
                <form
                  className="editor-row"
                  onSubmit={(event) => {
                    event.preventDefault();
                    run('keep', { label });
                    setLabel('');
                  }}
                >
                  <input
                    className="field grow"
                    value={label}
                    maxLength={60}
                    placeholder="a name for this moment"
                    onChange={(event) => setLabel(event.target.value)}
                  />
                  <button type="submit" className="chip-button" disabled={act.state !== 'idle'}>
                    keep a version
                  </button>
                </form>
                <ol className="versions">
                  {versions.length === 0 && <li className="text-faint">none kept yet</li>}
                  {versions.map((version) => (
                    <li key={version.id}>
                      <span className="when">{version.at.slice(0, 16).replace('T', ' ')}</span>
                      <code>
                        {version.label ?? version.title ?? ''} · {version.by}
                      </code>
                      <Confirm
                        label="restore"
                        act={() => run('restore', { version: String(version.id) })}
                        className="chip-button"
                      />
                    </li>
                  ))}
                </ol>
              </div>
            )}
            {tab === 'more' && (
              <div className="grid gap-5">
                <Row label="save as a template">
                  <form
                    className="editor-row"
                    onSubmit={(event) => {
                      event.preventDefault();
                      run('template', { name: templateName });
                      setTemplateName('');
                    }}
                  >
                    <input
                      className="field grow"
                      value={templateName}
                      maxLength={40}
                      placeholder="template name"
                      onChange={(event) => setTemplateName(event.target.value)}
                    />
                    <button type="submit" className="chip-button" disabled={!templateName.trim()}>
                      save
                    </button>
                  </form>
                </Row>
                <Row label="your templates">
                  <ul className="mono-sm grid gap-2">
                    {templates.filter((template) => template.by).length === 0 && (
                      <li className="text-faint">only the built-in ones</li>
                    )}
                    {templates
                      .filter((template) => template.by)
                      .map((template) => (
                        <li key={template.id} className="editor-row">
                          <span className="grow">{template.name}</span>
                          <button
                            type="button"
                            className="remove"
                            aria-label={`Remove ${template.name}`}
                            onClick={() => run('remove-template', { template: template.id })}
                          >
                            ×
                          </button>
                        </li>
                      ))}
                  </ul>
                </Row>
                {access.manage && (
                  <Row label="trash">
                    <div className="editor-row">
                      <span className="mono-sm text-faint grow">
                        kept 30 days, restorable from your posts
                      </span>
                      <Confirm label="trash this post" act={() => run('trash')} />
                    </div>
                  </Row>
                )}
                <Button to="/blog/mine">all your posts</Button>
              </div>
            )}
          </div>
        </aside>
      }
    >
      <div className="blog editor" style={accentStyle(author?.accent)}>
        <header className="page-head">
          <Field density={3600} reach={90} />
          <p className="path">
            <Link to="/blog" className="hover:text-ink hover:underline">
              /blog
            </Link>
            /{post.id.slice(0, 6)}/edit
          </p>
          <textarea
            className="title-field"
            aria-label="Title"
            placeholder="Untitled"
            rows={1}
            maxLength={POST_LIMITS.title}
            value={draft.title}
            readOnly={!access.edit}
            onChange={(event) => title(event.target.value.replace(/\n/g, ' '))}
            onKeyDown={(event) => event.key === 'Enter' && event.preventDefault()}
          />
          <div className="rule">
            <span className="facts">
              <Fact value={report.words} label="words" />
              <Fact value={report.minutes} label="min read" />
              <span className="fact live" data-connection={report.connection}>
                <i />
                {live}
                {report.peers.length > 0 &&
                  ` · ${report.peers.map((peer) => peer.name).join(', ')} here`}
              </span>
            </span>
          </div>
        </header>
        <Suspense fallback={<div className="writer loading" />}>
          {hydrated && (
            <PostEditor
              key={post.id}
              id={post.id}
              token={csrf}
              login={root.viewer!.login}
              user={{
                name: me?.name ?? root.viewer!.login,
                color: me?.accent ?? '#8b8b95',
                handle: loaderData.handle,
              }}
              editable={access.edit}
              upload={upload}
              report={setReport}
            />
          )}
        </Suspense>
      </div>
    </Page>
  );
}
