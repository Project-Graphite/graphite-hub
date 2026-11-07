import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { data, Link, redirect, useFetcher, useSearchParams } from 'react-router';
import type { Route } from './+types/editor';
import { accentStyle, Avatar } from '../components/kit/basics';
import { creditedProjects } from '../components/kit/blocks';
import { Confirm, Segmented, Sortable, Switch } from '../components/kit/controls';
import { Page } from '../components/Shell';
import { hubContext, type Hub } from '../context';
import { useHub, useRoot } from '../hub';
import { createModel } from '../model';
import { MemberView } from '../pages/member-page';
import { STATUSES, type Presentation, type RegistryFields } from '../presentation';
import {
  BLOCK_LABEL,
  BLOCK_TYPES,
  isUploadKind,
  isRefused,
  newBlock,
  UPLOAD_LIMIT,
  uploadUrl,
  type Block,
  type BlockType,
  type ProfileFields,
  type ShortLink,
  type UploadKind,
} from '../profile';
import { topicsFor } from '../topics';
import type { Member } from '../types';

export const handle = topicsFor('editor');

const SINGLE: BlockType[] = [
  'bio',
  'projects',
  'stack',
  'github',
  'timeline',
  'links',
  'short-links',
  'writing',
];

function editable(hub: Hub, params: { handle?: string; alias?: string }) {
  const model = createModel(hub.directory);
  const member = params.handle
    ? model.memberByHandle(params.handle)
    : model.resolve(`/${params.alias}`).member;
  const viewer = hub.viewer;
  if (
    !member ||
    !viewer ||
    !(viewer.owner || viewer.login.toLowerCase() === member.github.toLowerCase())
  ) {
    throw data(null, { status: 404 });
  }
  return { member, by: viewer.login };
}

function editAddress(handle: string, alias: string | null) {
  return alias ? `/${alias}/edit` : `/members/${handle}/edit`;
}

export function loader({ context, params }: Route.LoaderArgs) {
  const hub = context.get(hubContext);
  const { member } = editable(hub, params);
  if (params.handle && member.alias) {
    throw redirect(editAddress(member.handle, member.alias), 301);
  }
  return {
    handle: member.handle,
    projects: hub.writeback.ownedBy(member.handle).map((project) => ({
      ...project,
      presentation: hub.presentations.read(project.slug),
      registry: hub.writeback.current(project.slug)!,
    })),
    profile: hub.profiles.read(member.handle),
    shortLinks: hub.profiles.shortLinks(member.handle, true),
    history: hub.profiles.history(member.handle),
    today: new Date().toISOString().slice(0, 10),
  };
}

export async function action({ context, params, request }: Route.ActionArgs) {
  const hub = context.get(hubContext);
  const { member, by } = editable(hub, params);
  if (request.headers.get('origin') !== hub.origin) {
    throw data(null, { status: 403 });
  }
  if (Number(request.headers.get('content-length') ?? 0) > UPLOAD_LIMIT + 65_536) {
    return data({ error: 'Images are up to 5 MB.' }, { status: 413 });
  }
  const form = await request.formData();
  if (form.get('csrf') !== hub.csrf) {
    throw data(null, { status: 403 });
  }
  const { profiles, uploads } = hub;
  const handle = member.handle;
  try {
    switch (form.get('intent')) {
      case 'save':
        await profiles.save(handle, JSON.parse(String(form.get('draft'))), by);
        break;
      case 'undo':
        await profiles.undo(handle, by);
        break;
      case 'revert':
        await profiles.revert(handle, Number(form.get('version')), by);
        break;
      case 'reset':
        await profiles.reset(handle, by);
        break;
      case 'upload': {
        const kind = form.get('kind');
        const file = form.get('file');
        if (!isUploadKind(kind) || !(file instanceof Blob)) {
          return data({ error: 'Choose an image.' }, { status: 400 });
        }
        return { upload: await uploads.store(handle, kind, file), kind };
      }
      case 'presentation':
      case 'registry': {
        const slug = String(form.get('slug') ?? '');
        if (!hub.writeback.ownedBy(handle).some((project) => project.slug === slug)) {
          return data({ error: `${slug} is not ${member.name}'s project.` }, { status: 400 });
        }
        const value = JSON.parse(String(form.get('value')));
        if (form.get('intent') === 'presentation') {
          await hub.presentations.save(slug, value, by);
          break;
        }
        return await hub.writeback.write(slug, value, by);
      }
      case 'link':
        await profiles.setShortLink(
          handle,
          {
            name: String(form.get('name') ?? ''),
            url: String(form.get('url') ?? ''),
            listed: form.get('listed') !== 'false',
          },
          by,
        );
        break;
      case 'unlink':
        await profiles.removeShortLink(handle, String(form.get('name') ?? ''), by);
        break;
    }
  } catch (error) {
    if (isRefused(error)) {
      return data({ error: error.message }, { status: 400 });
    }
    throw error;
  }
  const alias = profiles.read(handle).alias;
  if (alias !== member.alias) {
    throw redirect(editAddress(handle, alias));
  }
  return { ok: true };
}

interface Draft {
  fields: ProfileFields;
  blocks: Block[];
}

type Result = { ok?: boolean; error?: string; upload?: string; kind?: UploadKind };

const when = (iso: string) => iso.slice(0, 16).replace('T', ' ');

function locate(id: string) {
  const target = document.getElementById(id);
  if (!target) {
    return;
  }
  target.scrollIntoView({ block: 'start' });
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
    target.animate(
      [
        { outline: '1px solid var(--accent)', outlineOffset: '12px' },
        { outline: '1px solid transparent', outlineOffset: '12px' },
      ],
      { duration: 1400, easing: 'ease-out' },
    );
  }
}

function SaveState({ state, error }: { state: 'saving' | 'saved' | 'error'; error?: string }) {
  return (
    <span className="setting-state" data-state={state}>
      <i />
      {state === 'error' ? error : state}
    </span>
  );
}

function UploadButton({
  kind,
  label,
  csrf,
  uploaded,
}: {
  kind: UploadKind;
  label: string;
  csrf: string;
  uploaded: (id: string) => void;
}) {
  const fetcher = useFetcher<Result>();
  const input = useRef<HTMLInputElement>(null);
  const done = fetcher.data?.upload;
  const handled = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (done && handled.current !== done) {
      handled.current = done;
      uploaded(done);
    }
  });
  return (
    <span className="upload">
      <button
        type="button"
        className="chip-button"
        disabled={fetcher.state !== 'idle'}
        onClick={() => input.current?.click()}
      >
        {fetcher.state !== 'idle' ? 'uploading…' : label}
      </button>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            const form = new FormData();
            form.set('csrf', csrf);
            form.set('intent', 'upload');
            form.set('kind', kind);
            form.set('file', file);
            void fetcher.submit(form, { method: 'post', encType: 'multipart/form-data' });
          }
          event.target.value = '';
        }}
      />
      {fetcher.data?.error && <span className="text-danger">{fetcher.data.error}</span>}
    </span>
  );
}

function Field({
  label,
  row = false,
  children,
}: {
  label: string;
  row?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="editor-field" data-row={row || undefined}>
      <span>{label}</span>
      {children}
    </label>
  );
}

function Thumb({ src, round = false }: { src: string | null; round?: boolean }) {
  return src ? (
    <img className={`thumb ${round ? 'round' : ''}`} src={src} alt="" />
  ) : (
    <span className={`thumb empty ${round ? 'round' : ''}`} />
  );
}

function BlockEditor({
  block,
  change,
  csrf,
  credited,
}: {
  block: Block;
  change: (next: Block) => void;
  csrf: string;
  credited: { slug: string; name: string }[];
}) {
  switch (block.type) {
    case 'stack':
      return (
        <div className="grid gap-3">
          {block.groups.map((group, index) => (
            <div key={index} className="editor-row">
              <input
                className="field"
                value={group.group}
                aria-label="Group"
                placeholder="group"
                onChange={(event) =>
                  change({
                    ...block,
                    groups: block.groups.map((other, at) =>
                      at === index ? { ...other, group: event.target.value } : other,
                    ),
                  })
                }
              />
              <input
                className="field grow"
                value={group.items.join(', ')}
                aria-label="Items, separated by commas"
                placeholder="TypeScript, React"
                onChange={(event) =>
                  change({
                    ...block,
                    groups: block.groups.map((other, at) =>
                      at === index
                        ? {
                            ...other,
                            items: event.target.value
                              .split(',')
                              .map((item) => item.trim())
                              .filter(Boolean),
                          }
                        : other,
                    ),
                  })
                }
              />
              <button
                type="button"
                className="remove"
                aria-label="Remove group"
                onClick={() =>
                  change({ ...block, groups: block.groups.filter((_, at) => at !== index) })
                }
              >
                ×
              </button>
            </div>
          ))}
          <button
            type="button"
            className="chip-button add"
            onClick={() =>
              change({ ...block, groups: [...block.groups, { group: '', items: [] }] })
            }
          >
            + group
          </button>
        </div>
      );
    case 'links':
      return (
        <div className="grid gap-3">
          {block.links.map((link, index) => (
            <div key={index} className="editor-row">
              <input
                className="field"
                value={link.label}
                aria-label="Label"
                placeholder="label"
                onChange={(event) =>
                  change({
                    ...block,
                    links: block.links.map((other, at) =>
                      at === index ? { ...other, label: event.target.value } : other,
                    ),
                  })
                }
              />
              <input
                className="field grow"
                value={link.url}
                aria-label="Address"
                placeholder="https://"
                onChange={(event) =>
                  change({
                    ...block,
                    links: block.links.map((other, at) =>
                      at === index ? { ...other, url: event.target.value } : other,
                    ),
                  })
                }
              />
              <button
                type="button"
                className="remove"
                aria-label="Remove link"
                onClick={() =>
                  change({ ...block, links: block.links.filter((_, at) => at !== index) })
                }
              >
                ×
              </button>
            </div>
          ))}
          <button
            type="button"
            className="chip-button add"
            onClick={() =>
              change({ ...block, links: [...block.links, { label: '', url: 'https://' }] })
            }
          >
            + link
          </button>
        </div>
      );
    case 'projects': {
      const chosen = block.slugs ?? credited.map((project) => project.slug);
      return (
        <div className="grid gap-3">
          <Segmented
            label="Layout"
            options={[
              ['windows', 'windows'],
              ['rows', 'rows'],
            ]}
            value={block.layout}
            choose={(layout) => change({ ...block, layout })}
          />
          <div className="chips">
            {credited.map((project) => (
              <button
                key={project.slug}
                type="button"
                aria-pressed={chosen.includes(project.slug)}
                onClick={() =>
                  change({
                    ...block,
                    slugs: chosen.includes(project.slug)
                      ? chosen.filter((slug) => slug !== project.slug)
                      : [...chosen, project.slug],
                  })
                }
              >
                {project.name}
              </button>
            ))}
          </div>
        </div>
      );
    }
    case 'gallery':
      return (
        <div className="grid gap-3">
          {block.images.map((image, index) => (
            <div key={image.upload} className="editor-row">
              <Thumb src={uploadUrl(image.upload, 'gallery', 'small')} />
              <input
                className="field grow"
                value={image.caption}
                aria-label="Caption"
                placeholder="caption"
                onChange={(event) =>
                  change({
                    ...block,
                    images: block.images.map((other, at) =>
                      at === index ? { ...other, caption: event.target.value } : other,
                    ),
                  })
                }
              />
              <button
                type="button"
                className="remove"
                aria-label="Remove image"
                onClick={() =>
                  change({ ...block, images: block.images.filter((_, at) => at !== index) })
                }
              >
                ×
              </button>
            </div>
          ))}
          <UploadButton
            kind="gallery"
            label="+ image"
            csrf={csrf}
            uploaded={(upload) =>
              change({ ...block, images: [...block.images, { upload, caption: '' }] })
            }
          />
        </div>
      );
    case 'text':
      return (
        <div className="grid gap-3">
          <input
            className="field"
            value={block.title}
            aria-label="Title"
            placeholder="title"
            onChange={(event) => change({ ...block, title: event.target.value })}
          />
          <textarea
            className="field"
            value={block.body}
            aria-label="Text"
            onChange={(event) => change({ ...block, body: event.target.value })}
          />
        </div>
      );
    case 'quote':
      return (
        <div className="grid gap-3">
          <textarea
            className="field"
            value={block.text}
            aria-label="Quote"
            onChange={(event) => change({ ...block, text: event.target.value })}
          />
          <input
            className="field"
            value={block.source}
            aria-label="Source"
            placeholder="source"
            onChange={(event) => change({ ...block, source: event.target.value })}
          />
        </div>
      );
    case 'embed':
      return (
        <div className="grid gap-3">
          <input
            className="field"
            value={block.url}
            aria-label="Address"
            onChange={(event) => change({ ...block, url: event.target.value })}
          />
          <input
            className="field"
            value={block.title}
            aria-label="Title"
            placeholder="title"
            onChange={(event) => change({ ...block, title: event.target.value })}
          />
        </div>
      );
    default:
      return null;
  }
}

const FIXED: BlockType[] = ['bio', 'github', 'timeline', 'short-links', 'writing'];

function PageTab({
  blocks,
  change,
  csrf,
  credited,
}: {
  blocks: Block[];
  change: (next: Block[]) => void;
  csrf: string;
  credited: { slug: string; name: string }[];
}) {
  const [open, setOpen] = useState<string | null>(null);
  const present = new Set(blocks.map((block) => block.type));
  const addable = BLOCK_TYPES.filter((type) => !SINGLE.includes(type) || !present.has(type));
  return (
    <div className="grid gap-5">
      <Sortable
        items={blocks}
        keyOf={(block) => block.id}
        labelOf={(block) => BLOCK_LABEL[block.type]}
        reorder={change}
      >
        {(block) => {
          const fixed = FIXED.includes(block.type);
          return (
            <div className="block-row" data-open={open === block.id || undefined}>
              <div className="block-head">
                <button
                  type="button"
                  className="name"
                  aria-expanded={fixed ? undefined : open === block.id}
                  onClick={() => {
                    setOpen(open === block.id || fixed ? null : block.id);
                    locate(block.id);
                  }}
                >
                  {block.type === 'text' && block.title ? block.title : BLOCK_LABEL[block.type]}
                </button>
                <button
                  type="button"
                  className="remove"
                  aria-label={`Remove ${BLOCK_LABEL[block.type]}`}
                  onClick={() => change(blocks.filter((other) => other.id !== block.id))}
                >
                  ×
                </button>
              </div>
              {open === block.id && !fixed && (
                <div className="block-body">
                  <BlockEditor
                    block={block}
                    csrf={csrf}
                    credited={credited}
                    change={(next) =>
                      change(blocks.map((other) => (other.id === block.id ? next : other)))
                    }
                  />
                </div>
              )}
            </div>
          );
        }}
      </Sortable>
      <div className="chips add">
        {addable.map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => {
              const id = `${type}-${Date.now().toString(36)}`;
              change([...blocks, newBlock(type, id)]);
              setOpen(id);
            }}
          >
            + {BLOCK_LABEL[type]}
          </button>
        ))}
      </div>
    </div>
  );
}

function ProfileTab({
  fields,
  change,
  csrf,
  member,
}: {
  fields: ProfileFields;
  change: (next: ProfileFields, delay?: number) => void;
  csrf: string;
  member: Member;
}) {
  const accents = useRoot()!.settings['site.accents'];
  const reset = useFetcher<Result>();
  const [alias, setAlias] = useState(fields.alias ?? '');
  return (
    <div className="grid gap-5">
      <Field label="alias">
        <div className="editor-row">
          <span className="mono-sm text-faint">/</span>
          <input
            className="field grow"
            value={alias}
            placeholder={member.handle}
            onChange={(event) => setAlias(event.target.value.toLowerCase())}
            onBlur={() => change({ ...fields, alias: alias || null }, 0)}
            onKeyDown={(event) => event.key === 'Enter' && event.currentTarget.blur()}
          />
        </div>
      </Field>
      <Field label="headline">
        <input
          className="field"
          value={fields.headline ?? ''}
          maxLength={90}
          onChange={(event) => change({ ...fields, headline: event.target.value || null })}
        />
      </Field>
      <Field label="bio">
        <textarea
          className="field"
          value={fields.bio ?? ''}
          maxLength={1200}
          onChange={(event) => change({ ...fields, bio: event.target.value || null })}
        />
      </Field>
      <Field label="accent">
        <div className="swatches">
          {accents.map((colour) => (
            <button
              key={colour}
              type="button"
              className="swatch pick"
              aria-label={colour}
              aria-pressed={(fields.accent ?? member.accent) === colour}
              style={{ '--swatch': colour } as CSSProperties}
              onClick={() => change({ ...fields, accent: colour }, 0)}
            />
          ))}
        </div>
      </Field>
      <Field label="avatar">
        <div className="editor-row">
          <Thumb src={member.avatarUrl} round />
          <UploadButton
            kind="avatar"
            label="upload"
            csrf={csrf}
            uploaded={(avatarUpload) => change({ ...fields, avatarUpload }, 0)}
          />
          {fields.avatarUpload && (
            <button
              type="button"
              className="chip-button"
              onClick={() => change({ ...fields, avatarUpload: null }, 0)}
            >
              use GitHub&apos;s
            </button>
          )}
        </div>
      </Field>
      <Field label="cover">
        <div className="editor-row">
          <Thumb src={fields.coverUpload && uploadUrl(fields.coverUpload, 'cover', 'small')} />
          <UploadButton
            kind="cover"
            label="upload"
            csrf={csrf}
            uploaded={(coverUpload) => change({ ...fields, coverUpload }, 0)}
          />
          {fields.coverUpload && (
            <button
              type="button"
              className="chip-button"
              onClick={() => change({ ...fields, coverUpload: null }, 0)}
            >
              remove
            </button>
          )}
        </div>
      </Field>
      <Field label="listed on the site" row>
        <Switch
          on={fields.listed}
          label="Listed on the site"
          toggle={() => change({ ...fields, listed: !fields.listed }, 0)}
        />
      </Field>
      <div className="editor-row">
        <Confirm
          label="reset to GitHub"
          sure="sure? blocks and images go"
          disabled={reset.state !== 'idle'}
          act={() => reset.submit({ csrf, intent: 'reset' }, { method: 'post' })}
        />
        {reset.data?.error && <span className="mono-sm text-danger">{reset.data.error}</span>}
      </div>
    </div>
  );
}

function LinksTab({
  links,
  csrf,
  alias,
  chooseAlias,
}: {
  links: ShortLink[];
  csrf: string;
  alias: string | null;
  chooseAlias: () => void;
}) {
  const add = useFetcher<Result>();
  const edit = useFetcher<Result>();
  if (!alias) {
    return (
      <button type="button" className="chip-button" onClick={chooseAlias}>
        set an alias first
      </button>
    );
  }
  return (
    <div className="grid gap-5">
      {links.length > 0 && (
        <ul className="short-links">
          {links.map((link) => (
            <li key={link.name} className="editor-row" data-off={!link.listed || undefined}>
              <span className="mono-sm grow">
                /{alias}/go/{link.name}
                <span className="block truncate text-faint">{link.url}</span>
              </span>
              <Switch
                on={link.listed}
                label={`Show ${link.name} on the page`}
                toggle={() =>
                  edit.submit(
                    { csrf, intent: 'link', ...link, listed: String(!link.listed) },
                    { method: 'post' },
                  )
                }
              />
              <button
                type="button"
                className="remove"
                aria-label={`Remove ${link.name}`}
                onClick={() =>
                  edit.submit({ csrf, intent: 'unlink', name: link.name }, { method: 'post' })
                }
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <add.Form method="post" className="grid gap-2" key={links.length}>
        <input type="hidden" name="csrf" value={csrf} />
        <input type="hidden" name="intent" value="link" />
        <div className="editor-row">
          <span className="mono-sm text-faint">/{alias}/go/</span>
          <input className="field" name="name" placeholder="name" aria-label="Name" required />
          <input
            className="field grow"
            name="url"
            placeholder="https://"
            aria-label="Address"
            required
          />
          <button type="submit" className="chip-button" disabled={add.state !== 'idle'}>
            add
          </button>
        </div>
        {(add.data?.error ?? edit.data?.error) && (
          <span className="mono-sm text-danger">{add.data?.error ?? edit.data?.error}</span>
        )}
      </add.Form>
    </div>
  );
}

function HistoryTab({
  history,
  csrf,
}: {
  history: { id: number; by: string; at: string }[];
  csrf: string;
}) {
  const revert = useFetcher<Result>();
  return (
    <ol className="versions">
      {history.length === 0 && <li className="text-faint">no saves yet</li>}
      {history.map((version, index) => (
        <li key={version.id}>
          <span className="when">
            {when(version.at)} · {version.by}
          </span>
          {index === 0 ? (
            <span className="text-faint">current</span>
          ) : (
            <button
              type="button"
              className="rule-link"
              disabled={revert.state !== 'idle'}
              onClick={() =>
                revert.submit(
                  { csrf, intent: 'revert', version: String(version.id) },
                  { method: 'post' },
                )
              }
            >
              restore
            </button>
          )}
        </li>
      ))}
    </ol>
  );
}

type EditedProject = Route.ComponentProps['loaderData']['projects'][number];

function ProjectEditor({
  project,
  csrf,
  accents,
}: {
  project: EditedProject;
  csrf: string;
  accents: string[];
}) {
  const server = project.presentation;
  const serverKey = JSON.stringify(server);
  const [draft, setDraft] = useState<Presentation>(server);
  const [base, setBase] = useState(serverKey);
  const [dirty, setDirty] = useState(false);
  const [registry, setRegistry] = useState<RegistryFields>(project.registry);
  if (serverKey !== base) {
    setBase(serverKey);
    if (!dirty) {
      setDraft(server);
    }
  }
  const save = useFetcher<Result>();
  const send = useFetcher<Result & { outcome?: string; pullRequest?: string | null }>();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const hub = useHub();
  const linkable = hub.posts.filter(
    (post) => post.project === project.slug || draft.feature.posts.includes(post.id),
  );
  useEffect(() => () => clearTimeout(timer.current), []);
  const change = (next: Presentation, delay = 700) => {
    setDraft(next);
    setDirty(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setDirty(false);
      void save.submit(
        { csrf, intent: 'presentation', slug: project.slug, value: JSON.stringify(next) },
        { method: 'post' },
      );
    }, delay);
  };
  const state = dirty || save.state !== 'idle' ? 'saving' : save.data?.error ? 'error' : 'saved';
  const unchanged = JSON.stringify(registry) === JSON.stringify(project.registry);

  return (
    <div className="grid gap-5">
      <div className="editor-row">
        <span className="mono-sm grow text-faint">on the site</span>
        <SaveState state={state} error={save.data?.error} />
      </div>
      <Field label="cover">
        <div className="editor-row">
          <Thumb src={draft.coverUpload && uploadUrl(draft.coverUpload, 'cover', 'small')} />
          <UploadButton
            kind="cover"
            label="upload"
            csrf={csrf}
            uploaded={(coverUpload) => change({ ...draft, coverUpload }, 0)}
          />
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
      </Field>
      <Field label="accent">
        <div className="swatches">
          <button
            type="button"
            className="chip-button"
            aria-pressed={draft.accent === null}
            onClick={() => change({ ...draft, accent: null }, 0)}
          >
            owner&apos;s
          </button>
          {accents.map((colour) => (
            <button
              key={colour}
              type="button"
              className="swatch pick"
              aria-label={colour}
              aria-pressed={draft.accent === colour}
              style={{ '--swatch': colour } as CSSProperties}
              onClick={() => change({ ...draft, accent: colour }, 0)}
            />
          ))}
        </div>
      </Field>
      <Field label="layout">
        <Segmented
          label="Layout"
          options={[
            ['window', 'window'],
            ['card', 'card'],
          ]}
          value={draft.layout}
          choose={(layout) => change({ ...draft, layout }, 0)}
        />
      </Field>
      <Field label="summary on the site">
        <textarea
          className="field"
          value={draft.summary ?? ''}
          placeholder={project.registry.summary}
          maxLength={240}
          onChange={(event) => change({ ...draft, summary: event.target.value || null })}
        />
      </Field>
      <Field label="feature">
        <textarea
          className="field"
          value={draft.feature.note}
          maxLength={600}
          placeholder="a note"
          onChange={(event) =>
            change({ ...draft, feature: { ...draft.feature, note: event.target.value } })
          }
        />
        <div className="editor-row">
          <Thumb
            src={
              draft.feature.screenshot && uploadUrl(draft.feature.screenshot, 'screenshot', 'small')
            }
          />
          <UploadButton
            kind="screenshot"
            label="screenshot"
            csrf={csrf}
            uploaded={(screenshot) =>
              change({ ...draft, feature: { ...draft.feature, screenshot } }, 0)
            }
          />
          {draft.feature.screenshot && (
            <button
              type="button"
              className="chip-button"
              onClick={() =>
                change({ ...draft, feature: { ...draft.feature, screenshot: null } }, 0)
              }
            >
              remove
            </button>
          )}
        </div>
        {linkable.length > 0 && (
          <div className="chips">
            {linkable.map((post) => {
              const on = draft.feature.posts.includes(post.id);
              return (
                <button
                  key={post.id}
                  type="button"
                  aria-pressed={on}
                  disabled={!on && draft.feature.posts.length >= 3}
                  onClick={() =>
                    change(
                      {
                        ...draft,
                        feature: {
                          ...draft.feature,
                          posts: on
                            ? draft.feature.posts.filter((id) => id !== post.id)
                            : [...draft.feature.posts, post.id],
                        },
                      },
                      0,
                    )
                  }
                >
                  {post.title}
                </button>
              );
            })}
          </div>
        )}
      </Field>

      <div className="registry">
        <div className="editor-row">
          <span className="mono-sm grow text-faint">in the repository · .graphite.yml</span>
          {!unchanged && <SaveState state="saving" />}
        </div>
        <Field label="name">
          <input
            className="field"
            value={registry.name}
            maxLength={60}
            onChange={(event) => setRegistry({ ...registry, name: event.target.value })}
          />
        </Field>
        <Field label="summary">
          <textarea
            className="field"
            value={registry.summary}
            maxLength={240}
            onChange={(event) => setRegistry({ ...registry, summary: event.target.value })}
          />
        </Field>
        <Field label="tags">
          <input
            className="field"
            value={registry.tags.join(', ')}
            onChange={(event) =>
              setRegistry({
                ...registry,
                tags: event.target.value
                  .split(',')
                  .map((tag) => tag.trim())
                  .filter(Boolean),
              })
            }
          />
        </Field>
        <Field label="status">
          <Segmented
            label="Status"
            options={STATUSES.map((status) => [status, status] as const)}
            value={registry.status}
            choose={(status) => setRegistry({ ...registry, status })}
          />
        </Field>
        <Field label="pinned on the home page" row>
          <Switch
            on={registry.pinned}
            label="Pinned"
            toggle={() => setRegistry({ ...registry, pinned: !registry.pinned })}
          />
        </Field>
        <Field label="listed on the site" row>
          <Switch
            on={registry.listed}
            label="Listed"
            toggle={() => setRegistry({ ...registry, listed: !registry.listed })}
          />
        </Field>
        <div className="editor-row">
          <button
            type="button"
            className="chip-button"
            disabled={send.state !== 'idle' || unchanged}
            onClick={() =>
              send.submit(
                { csrf, intent: 'registry', slug: project.slug, value: JSON.stringify(registry) },
                { method: 'post' },
              )
            }
          >
            {send.state !== 'idle' ? 'sending…' : 'send to the repository'}
          </button>
          <span className="mono-sm">
            {send.data?.error && <span className="text-danger">{send.data.error}</span>}
            {project.pending.length > 0 &&
              !send.data?.error &&
              (project.pullRequest ? (
                <a href={project.pullRequest} className="rule-link">
                  {project.pending.join(', ')} in a pull request
                </a>
              ) : (
                <span className="text-faint">{project.pending.join(', ')} pending the sync</span>
              ))}
          </span>
        </div>
      </div>
    </div>
  );
}

function ProjectsTab({
  projects,
  csrf,
  initial,
}: {
  projects: EditedProject[];
  csrf: string;
  initial: string | null;
}) {
  const accents = useRoot()!.settings['site.accents'];
  const [slug, setSlug] = useState(
    projects.find((project) => project.slug === initial)?.slug ?? projects[0]?.slug,
  );
  const project = projects.find((candidate) => candidate.slug === slug);
  if (!project) {
    return <p className="mono-sm text-faint">no projects yet</p>;
  }
  return (
    <div className="grid gap-5">
      <div className="chips">
        {projects.map((candidate) => (
          <button
            key={candidate.slug}
            type="button"
            aria-pressed={candidate.slug === slug}
            onClick={() => setSlug(candidate.slug)}
          >
            {candidate.name}
          </button>
        ))}
      </div>
      <ProjectEditor key={project.slug} project={project} csrf={csrf} accents={accents} />
    </div>
  );
}

const TABS = [
  ['page', 'page'],
  ['profile', 'profile'],
  ['projects', 'projects'],
  ['links', 'short links'],
  ['history', 'history'],
] as const;

export default function Editor({ loaderData }: Route.ComponentProps) {
  const root = useRoot()!;
  const csrf = root.csrf ?? '';
  const hub = useHub();
  const member = hub.memberByHandle(loaderData.handle)!;
  const { profile } = loaderData;
  const server: Draft = {
    fields: {
      alias: profile.alias,
      headline: profile.headline,
      bio: profile.bio,
      accent: profile.accent,
      avatarUpload: profile.avatarUpload,
      coverUpload: profile.coverUpload,
      listed: profile.listed,
    },
    blocks: profile.blocks,
  };
  const serverKey = JSON.stringify(server);
  const [draft, setDraft] = useState<Draft>(server);
  const [base, setBase] = useState(serverKey);
  const [dirty, setDirty] = useState(false);
  const [params] = useSearchParams();
  const [tab, setTab] = useState<(typeof TABS)[number][0]>(
    params.has('project') ? 'projects' : 'page',
  );
  if (serverKey !== base) {
    setBase(serverKey);
    if (!dirty) {
      setDraft(server);
    }
  }
  const save = useFetcher<Result>();
  const undo = useFetcher<Result>();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const change = (next: Draft, delay = 700) => {
    setDraft(next);
    setDirty(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setDirty(false);
      void save.submit({ csrf, intent: 'save', draft: JSON.stringify(next) }, { method: 'post' });
    }, delay);
  };

  const shown: Member = {
    ...member,
    headline: draft.fields.headline,
    bio: draft.fields.bio,
    accent: draft.fields.accent ?? member.accent,
    avatarUrl: draft.fields.avatarUpload
      ? uploadUrl(draft.fields.avatarUpload, 'avatar')
      : member.avatarUrl,
    coverUrl: draft.fields.coverUpload ? uploadUrl(draft.fields.coverUpload, 'cover') : null,
  };
  const credited = creditedProjects(hub, member).map(({ slug, name }) => ({ slug, name }));
  const state = dirty || save.state !== 'idle' ? 'saving' : save.data?.error ? 'error' : 'saved';

  return (
    <Page
      rail={
        <aside className="inspector" style={accentStyle(shown.accent)}>
          <div className="inspector-head">
            <Avatar member={shown} size="sm" />
            <span className="who">
              <strong>{member.name}</strong>
              <Link to={member.path} className="hover:text-ink">
                {member.path} ↗
              </Link>
            </span>
            <SaveState state={state} error={save.data?.error} />
            <button
              type="button"
              className="chip-button"
              disabled={loaderData.history.length < 2 || undo.state !== 'idle'}
              onClick={() => undo.submit({ csrf, intent: 'undo' }, { method: 'post' })}
            >
              undo
            </button>
          </div>
          <div className="tabs">
            <Segmented label="Section" options={TABS} value={tab} choose={setTab} />
          </div>
          <div className="inspector-body" key={tab}>
            {tab === 'page' && (
              <PageTab
                blocks={draft.blocks}
                csrf={csrf}
                credited={credited}
                change={(blocks) => change({ ...draft, blocks })}
              />
            )}
            {tab === 'profile' && (
              <ProfileTab
                fields={draft.fields}
                csrf={csrf}
                member={member}
                change={(fields, delay) => change({ ...draft, fields }, delay)}
              />
            )}
            {tab === 'projects' && (
              <ProjectsTab
                projects={loaderData.projects}
                csrf={csrf}
                initial={params.get('project')}
              />
            )}
            {tab === 'links' && (
              <LinksTab
                links={loaderData.shortLinks}
                csrf={csrf}
                alias={member.alias}
                chooseAlias={() => setTab('profile')}
              />
            )}
            {tab === 'history' && <HistoryTab history={loaderData.history} csrf={csrf} />}
          </div>
        </aside>
      }
    >
      <div className="stage" style={accentStyle(shown.accent)}>
        <div className="bar">
          <i />
          <i />
          <i />
          <span>{member.path}</span>
          <span className="live">live</span>
        </div>
        <div className="stage-body" aria-label="Live page">
          <MemberView
            member={shown}
            profile={{
              bio: draft.fields.bio,
              blocks: draft.blocks,
              shortLinks: loaderData.shortLinks.filter((link) => link.listed),
            }}
            today={loaderData.today}
          />
        </div>
      </div>
    </Page>
  );
}
