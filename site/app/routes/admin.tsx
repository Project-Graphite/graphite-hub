import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { data, Link, useFetcher } from 'react-router';
import type { Route } from './+types/admin';
import { Button, Panel } from '../components/kit/basics';
import { Segmented, Sortable, Switch } from '../components/kit/controls';
import { Fact, PageHeader } from '../components/kit/page';
import Section from '../components/Section';
import { Page } from '../components/Shell';
import { hubContext, type Hub } from '../context';
import { useRoot } from '../hub';
import {
  isSettingKey,
  SETTINGS,
  type Area,
  type ColorsSetting,
  type NumberSetting,
  type OrderItem,
  type SetSetting,
  type Setting,
  type SettingKey,
  type TextSetting,
} from '../settings';

export const handle = { topics: ['settings', 'errors'] };

function owner(hub: Hub) {
  if (!hub.viewer?.owner) {
    throw data(null, { status: 404 });
  }
  return hub.viewer;
}

export function loader({ context, request }: Route.LoaderArgs) {
  const hub = context.get(hubContext);
  owner(hub);
  const key = new URL(request.url).searchParams.get('history');
  return {
    errors: hub.admin.errors(),
    waiting: hub.messages.queue().length,
    history: key && isSettingKey(key) ? { key, versions: hub.admin.history(key) } : null,
  };
}

export async function action({ context, request }: Route.ActionArgs) {
  const hub = context.get(hubContext);
  const viewer = owner(hub);
  const form = await request.formData();
  if (request.headers.get('origin') !== hub.origin || form.get('csrf') !== hub.csrf) {
    throw data(null, { status: 403 });
  }
  const key = String(form.get('key') ?? '');
  try {
    switch (form.get('intent')) {
      case 'set':
        await hub.admin.setSetting(key, JSON.parse(String(form.get('value'))), viewer.login);
        break;
      case 'reset':
        if (isSettingKey(key)) {
          await hub.admin.resetSetting(key, viewer.login);
        }
        break;
      case 'revert':
        await hub.admin.revertSetting(Number(form.get('version')), viewer.login);
        break;
      case 'resolve':
        await hub.admin.resolveError(String(form.get('fingerprint')), viewer.login);
        break;
      case 'sign-out-everyone':
        return { ok: `${await hub.admin.signOutEveryone(viewer.login)} sessions ended.` };
    }
  } catch (error) {
    return data(
      { error: error instanceof Error ? error.message : String(error), key },
      { status: 400 },
    );
  }
  return { ok: 'saved', key };
}

const AREAS: Record<Area, string> = { site: 'site', home: 'home page', rail: 'rail' };

interface ControlProps<S extends Setting, V> {
  setting: S;
  value: V;
  change: (next: V) => void;
  commit: (next: V) => void;
}

function TextControl({ setting, value, change, commit }: ControlProps<TextSetting, string>) {
  const props = {
    className: 'field',
    maxLength: setting.max,
    value,
    placeholder: setting.optional ? 'empty' : undefined,
    'aria-label': setting.label,
    onBlur: () => commit(value),
  };
  return setting.multiline ? (
    <textarea {...props} rows={2} onChange={(event) => change(event.target.value)} />
  ) : (
    <input
      {...props}
      onChange={(event) => change(event.target.value)}
      onKeyDown={(event) => event.key === 'Enter' && event.currentTarget.blur()}
    />
  );
}

function NumberControl({ setting, value, commit }: ControlProps<NumberSetting, number>) {
  return (
    <div className="range">
      <input
        type="range"
        min={setting.min}
        max={setting.max}
        value={value}
        aria-label={setting.label}
        onChange={(event) => commit(Number(event.target.value))}
      />
      <output>{value}</output>
    </div>
  );
}

function OrderControl({ value: items, commit }: ControlProps<Setting, OrderItem[]>) {
  return (
    <Sortable
      items={items}
      keyOf={(item) => item.id}
      labelOf={(item) => item.id}
      dimmed={(item) => !item.on}
      reorder={commit}
    >
      {(item) => (
        <>
          <span className="name">{item.id}</span>
          <Switch
            on={item.on}
            label={`Show ${item.id}`}
            toggle={() =>
              commit(
                items.map((other) => (other.id === item.id ? { ...other, on: !other.on } : other)),
              )
            }
          />
        </>
      )}
    </Sortable>
  );
}

function SetControl({ setting, value: chosen, commit }: ControlProps<SetSetting, string[]>) {
  return (
    <div className="chips">
      {setting.options.map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={chosen.includes(option)}
          onClick={() =>
            commit(
              chosen.includes(option)
                ? chosen.filter((item) => item !== option)
                : setting.options.filter((item) => item === option || chosen.includes(item)),
            )
          }
        >
          {option}
        </button>
      ))}
    </div>
  );
}

function ColorsControl({ value: colours, commit }: ControlProps<ColorsSetting, string[]>) {
  return (
    <div className="swatches">
      {colours.map((colour, index) => (
        <span key={index} className="swatch" style={{ '--swatch': colour } as CSSProperties}>
          <input
            type="color"
            value={colour}
            aria-label={`Accent ${index + 1}, ${colour}`}
            onChange={(event) =>
              commit(colours.map((other, at) => (at === index ? event.target.value : other)))
            }
          />
          {colours.length > 3 && (
            <button
              type="button"
              aria-label={`Remove accent ${index + 1}`}
              onClick={() => commit(colours.filter((_, at) => at !== index))}
            >
              ×
            </button>
          )}
        </span>
      ))}
      {colours.length < 16 && (
        <button
          type="button"
          className="swatch add"
          aria-label="Add an accent"
          onClick={() => commit([...colours, '#8b8b95'])}
        >
          +
        </button>
      )}
    </div>
  );
}

function Control(props: ControlProps<Setting, unknown>) {
  switch (props.setting.kind) {
    case 'text':
      return <TextControl {...(props as ControlProps<TextSetting, string>)} />;
    case 'number':
      return <NumberControl {...(props as ControlProps<NumberSetting, number>)} />;
    case 'order':
      return <OrderControl {...(props as ControlProps<Setting, OrderItem[]>)} />;
    case 'set':
      return <SetControl {...(props as ControlProps<SetSetting, string[]>)} />;
    case 'colors':
      return <ColorsControl {...(props as ControlProps<ColorsSetting, string[]>)} />;
  }
}

function SettingRow({ settingKey, csrf }: { settingKey: SettingKey; csrf: string }) {
  const stored = useRoot()!.settings[settingKey];
  const setting: Setting = SETTINGS[settingKey];
  const [draft, setDraft] = useState<unknown>(stored);
  const [base, setBase] = useState<unknown>(stored);
  const fetcher = useFetcher<typeof action>();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  if (JSON.stringify(base) !== JSON.stringify(stored)) {
    setBase(stored);
    setDraft(stored);
  }
  const send = (intent: 'set' | 'reset', value?: unknown) =>
    fetcher.submit(
      { csrf, intent, key: settingKey, value: JSON.stringify(value ?? null) },
      { method: 'post' },
    );
  const commit = (value: unknown) => {
    setDraft(value);
    clearTimeout(timer.current);
    if (JSON.stringify(value) !== JSON.stringify(stored)) {
      timer.current = setTimeout(() => void send('set', value), 300);
    }
  };
  const result =
    fetcher.data && 'key' in fetcher.data && fetcher.data.key === settingKey ? fetcher.data : null;
  const state =
    fetcher.state !== 'idle'
      ? 'saving'
      : result && 'error' in result
        ? 'error'
        : result && JSON.stringify(draft) === JSON.stringify(stored)
          ? 'saved'
          : null;

  return (
    <div className="setting" data-kind={setting.kind}>
      <div className="setting-head">
        <span className="setting-label">{setting.label}</span>
        {state && (
          <span className="setting-state" data-state={state}>
            {state === 'error' && result && 'error' in result ? result.error : state}
          </span>
        )}
        <span className="setting-tools">
          <Link to={`?history=${settingKey}`} preventScrollReset>
            history
          </Link>
          <button type="button" onClick={() => void send('reset')}>
            reset
          </button>
        </span>
      </div>
      <Control setting={setting} value={draft} change={setDraft} commit={commit} />
    </div>
  );
}

const PREVIEWS = [
  ['/', 'home'],
  ['/members', 'members'],
  ['/projects', 'projects'],
  ['/status', 'status'],
  ['/messages', 'messages'],
] as const;
const DEVICES = { desktop: { width: 1440, height: 900 }, phone: { width: 390, height: 844 } };

function Preview() {
  const [path, setPath] = useState<string>('/');
  const [device, setDevice] = useState<keyof typeof DEVICES>('desktop');
  const [scale, setScale] = useState(0.4);
  const box = useRef<HTMLDivElement>(null);
  const size = DEVICES[device];

  useEffect(() => {
    const element = box.current;
    if (!element) {
      return;
    }
    const observer = new ResizeObserver(([entry]) =>
      setScale(Math.min(1, entry.contentRect.width / size.width)),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [size.width]);

  return (
    <Panel title="preview">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <Segmented options={PREVIEWS} value={path} choose={setPath} label="Page to preview" />
        <Segmented
          options={[
            ['desktop', 'desktop'],
            ['phone', 'phone'],
          ]}
          value={device}
          choose={setDevice}
          label="Device"
        />
      </div>
      <div ref={box} className="preview" style={{ height: size.height * scale }}>
        <iframe
          src={`${path}?edit`}
          title="Preview of the live site"
          width={size.width}
          height={size.height}
          style={{ transform: `scale(${scale})`, marginInline: scale < 1 ? 0 : 'auto' }}
        />
      </div>
    </Panel>
  );
}

export default function AdminPage({ loaderData }: Route.ComponentProps) {
  const root = useRoot()!;
  const csrf = root.csrf ?? '';
  const signOut = useFetcher<typeof action>();
  const resolve = useFetcher<typeof action>();
  const revert = useFetcher<typeof action>();
  const keys = Object.keys(SETTINGS) as SettingKey[];

  return (
    <Page>
      <div className="admin-layout">
        <div className="min-w-0">
          <PageHeader
            path="/admin"
            title="Admin"
            actions={
              <Button to="/?edit" primary arrow>
                edit the home page
              </Button>
            }
            facts={
              <>
                <Fact value={loaderData.waiting} label="waiting" />
                <Fact
                  value={loaderData.errors.filter((error) => !error.resolvedAt).length}
                  label="open errors"
                />
                <Fact value={root.directory.members.length} label="members" />
              </>
            }
          />
          {(Object.keys(AREAS) as Area[]).map((area) => (
            <Section key={area} label={AREAS[area]}>
              <div className="settings">
                {keys
                  .filter((key) => SETTINGS[key].area === area)
                  .map((key) => (
                    <SettingRow key={key} settingKey={key} csrf={csrf} />
                  ))}
              </div>
            </Section>
          ))}
          <Section label="members">
            <div className="settings">
              {root.directory.members.map((member) => (
                <div key={member.handle} className="setting">
                  <div className="setting-head">
                    <span className="setting-label">{member.name}</span>
                    <span className="mono-sm text-faint">
                      {member.path}
                      {member.listed ? '' : ' · unlisted'}
                    </span>
                    <span className="mono-sm ml-auto flex gap-4">
                      <Link to={member.path} className="rule-link">
                        view
                      </Link>
                      <Link to={`${member.path}/edit`} className="rule-link">
                        edit
                      </Link>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </Section>
          <Section label={`messages · ${loaderData.waiting} waiting`}>
            <Link to="/messages" className="rule-link mono-sm">
              moderate on /messages
            </Link>
          </Section>
          <Section
            label={`errors · ${loaderData.errors.filter((error) => !error.resolvedAt).length} open`}
          >
            <div className="grid gap-3">
              {loaderData.errors.length === 0 && (
                <p className="mono-sm text-faint">No errors recorded.</p>
              )}
              {loaderData.errors.map((error) => (
                <article
                  key={error.fingerprint}
                  className={`panel ${error.resolvedAt ? 'opacity-60' : ''}`}
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-3">
                    <strong className="font-semibold">{error.message}</strong>
                    <span className="mono-sm text-faint">
                      {error.count}× · last {error.lastAt.slice(0, 16).replace('T', ' ')}
                    </span>
                  </div>
                  <p className="mono-sm mt-2 text-faint">
                    {error.route ?? 'no route'} · request {error.requestId ?? 'none'} ·{' '}
                    {error.fingerprint}
                  </p>
                  {!error.resolvedAt && (
                    <resolve.Form method="post" className="mt-3">
                      <input type="hidden" name="csrf" value={csrf} />
                      <input type="hidden" name="fingerprint" value={error.fingerprint} />
                      <button
                        type="submit"
                        name="intent"
                        value="resolve"
                        className="rule-link mono-sm"
                      >
                        resolve
                      </button>
                    </resolve.Form>
                  )}
                </article>
              ))}
            </div>
          </Section>
        </div>
        <aside className="admin-side">
          <Preview />
          {loaderData.history && (
            <Panel
              title={`history · ${SETTINGS[loaderData.history.key].label}`}
              link={{ to: '?', label: 'close' }}
            >
              <ol className="grid gap-3">
                {loaderData.history.versions.map((version) => (
                  <li key={version.id} className="mono-sm grid gap-1">
                    <span className="text-faint">
                      {version.at.slice(0, 16).replace('T', ' ')} · {version.by}
                    </span>
                    <code className="truncate text-muted">{JSON.stringify(version.value)}</code>
                    <revert.Form method="post">
                      <input type="hidden" name="csrf" value={csrf} />
                      <input type="hidden" name="version" value={version.id} />
                      <button type="submit" name="intent" value="revert" className="rule-link">
                        revert to this
                      </button>
                    </revert.Form>
                  </li>
                ))}
                {loaderData.history.versions.length === 0 && (
                  <li className="mono-sm text-faint">Never changed; on its default.</li>
                )}
              </ol>
            </Panel>
          )}
          <Panel title="sessions">
            <signOut.Form method="post" className="grid gap-2">
              <input type="hidden" name="csrf" value={csrf} />
              <p className="text-sm text-muted">Ends every member's session, yours included.</p>
              <button type="submit" name="intent" value="sign-out-everyone" className="btn">
                sign everyone out
              </button>
              {signOut.data && 'ok' in signOut.data && (
                <span className="mono-sm text-live">{signOut.data.ok}</span>
              )}
            </signOut.Form>
          </Panel>
        </aside>
      </div>
    </Page>
  );
}
