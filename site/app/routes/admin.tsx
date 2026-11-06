import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { data, Link, useFetcher } from 'react-router';
import type { Route } from './+types/admin';
import { Avatar, Band, Button, Panel } from '../components/kit/basics';
import { Confirm, Segmented, Sortable, Switch } from '../components/kit/controls';
import { Fact, PageHeader } from '../components/kit/page';
import { Page } from '../components/Shell';
import { hubContext, type Hub } from '../context';
import { useRoot } from '../hub';
import { useSpotlight } from '../motion/motion';
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

const AREAS: Record<Area, string> = { site: 'site', home: 'home page', rail: 'rail', blog: 'blog' };

type Versions = NonNullable<Route.ComponentProps['loaderData']['history']>['versions'];

const when = (iso: string) => iso.slice(0, 16).replace('T', ' ');

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
    <div
      className="range"
      style={
        {
          '--fill': `${(((value - setting.min) / (setting.max - setting.min)) * 100).toFixed(1)}%`,
        } as CSSProperties
      }
    >
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

function History({ versions, csrf }: { versions: Versions; csrf: string }) {
  const revert = useFetcher<typeof action>();
  return (
    <ol className="versions">
      {versions.length === 0 && <li className="text-faint">on its default</li>}
      {versions.map((version, index) => (
        <li key={version.id}>
          <span className="when">
            {when(version.at)} · {version.by}
          </span>
          <code>{JSON.stringify(version.value)}</code>
          {index === 0 ? (
            <span className="text-faint">current</span>
          ) : (
            <button
              type="button"
              className="rule-link"
              disabled={revert.state !== 'idle'}
              onClick={() =>
                revert.submit(
                  { csrf, intent: 'revert', key: version.key, version: String(version.id) },
                  { method: 'post' },
                )
              }
            >
              revert
            </button>
          )}
        </li>
      ))}
    </ol>
  );
}

function SettingRow({
  settingKey,
  csrf,
  history,
}: {
  settingKey: SettingKey;
  csrf: string;
  history: Versions | null;
}) {
  const stored = useRoot()!.settings[settingKey];
  const setting: Setting = SETTINGS[settingKey];
  const [draft, setDraft] = useState<unknown>(stored);
  const [base, setBase] = useState<unknown>(stored);
  const fetcher = useFetcher<typeof action>();
  const spot = useSpotlight<HTMLElement>();
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
          : 'idle';
  const wide = setting.kind === 'text' ? setting.multiline : setting.kind !== 'number';

  return (
    <article
      ref={spot}
      className="setting spot"
      data-kind={setting.kind}
      data-state={state}
      data-wide={wide || undefined}
    >
      <div className="setting-head">
        <h3 className="setting-label">{setting.label}</h3>
        <span className="setting-state" data-state={state}>
          <i />
          {state === 'error' && result && 'error' in result ? result.error : state}
        </span>
        <span className="setting-tools">
          <Link
            to={history ? '?' : `?history=${settingKey}`}
            preventScrollReset
            aria-expanded={Boolean(history)}
          >
            history
          </Link>
          <button type="button" onClick={() => void send('reset')}>
            reset
          </button>
        </span>
      </div>
      <Control setting={setting} value={draft} change={setDraft} commit={commit} />
      {history && <History versions={history} csrf={csrf} />}
    </article>
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
  const [scale, setScale] = useState(0.35);
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
    <div className="window screen">
      <div className="bar">
        <i />
        <i />
        <i />
        <Segmented options={PREVIEWS} value={path} choose={setPath} label="Page to preview" />
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
      <div className="foot">
        <Link to={`${path}?edit`} className="rule-link">
          write on {path}
        </Link>
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
    </div>
  );
}

function Sessions({ csrf }: { csrf: string }) {
  const signOut = useFetcher<typeof action>();
  return (
    <Panel title="sessions">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Confirm
          label="sign everyone out"
          sure="sure? everyone, you included"
          disabled={signOut.state !== 'idle'}
          act={() => signOut.submit({ csrf, intent: 'sign-out-everyone' }, { method: 'post' })}
        />
        {signOut.data && 'ok' in signOut.data && (
          <span className="mono-sm text-live">{signOut.data.ok}</span>
        )}
      </div>
    </Panel>
  );
}

function ErrorRow({
  error,
  csrf,
}: {
  error: Route.ComponentProps['loaderData']['errors'][number];
  csrf: string;
}) {
  const resolve = useFetcher<typeof action>();
  return (
    <article className="error" data-resolved={error.resolvedAt ? '' : undefined}>
      <strong>{error.message}</strong>
      <span className="count">{error.count}×</span>
      <span className="meta">
        <span>{error.route ?? 'no route'}</span>
        <span>{when(error.lastAt)}</span>
        <span>{error.fingerprint}</span>
        {error.requestId && <span>{error.requestId}</span>}
      </span>
      {error.resolvedAt ? (
        <span className="mono-sm text-faint">resolved {when(error.resolvedAt)}</span>
      ) : (
        <button
          type="button"
          className="chip-button"
          disabled={resolve.state !== 'idle'}
          onClick={() =>
            resolve.submit(
              { csrf, intent: 'resolve', fingerprint: error.fingerprint },
              { method: 'post' },
            )
          }
        >
          resolve
        </button>
      )}
    </article>
  );
}

export default function AdminPage({ loaderData }: Route.ComponentProps) {
  const root = useRoot()!;
  const csrf = root.csrf ?? '';
  const keys = Object.keys(SETTINGS) as SettingKey[];
  const open = loaderData.errors.filter((error) => !error.resolvedAt);
  const resolved = loaderData.errors.filter((error) => error.resolvedAt);
  const jumps = [
    ...Object.entries(AREAS),
    ['members', `members · ${root.directory.members.length}`],
    ['errors', `errors · ${open.length}`],
  ];

  return (
    <Page
      rail={
        <div className="admin-side">
          <Preview />
          <Sessions csrf={csrf} />
        </div>
      }
    >
      <div className="admin">
        <PageHeader
          path="/admin"
          title="Admin"
          actions={
            <>
              <Button to="/messages">
                moderate{loaderData.waiting > 0 && ` · ${loaderData.waiting}`}
              </Button>
              <Button to="/?edit" primary arrow>
                write on the home page
              </Button>
            </>
          }
          facts={
            <>
              <Fact value={loaderData.waiting} label="waiting" />
              <Fact value={open.length} label="open errors" />
              <Fact value={root.directory.members.length} label="members" />
            </>
          }
        >
          <nav className="jumps" aria-label="Sections">
            {jumps.map(([id, label]) => (
              <a key={id} href={`#${id}`}>
                {label}
              </a>
            ))}
          </nav>
        </PageHeader>
        {(Object.keys(AREAS) as Area[]).map((area) => (
          <div key={area} id={area}>
            <Band title={AREAS[area]}>
              <div className="settings">
                {keys
                  .filter((key) => SETTINGS[key].area === area)
                  .map((key) => (
                    <SettingRow
                      key={key}
                      settingKey={key}
                      csrf={csrf}
                      history={loaderData.history?.key === key ? loaderData.history.versions : null}
                    />
                  ))}
              </div>
            </Band>
          </div>
        ))}
        <div id="members">
          <Band title="members">
            <div className="seats">
              {root.directory.members.map((member) => (
                <article key={member.handle} className="seat">
                  <Avatar member={member} size="md" />
                  <span className="who">
                    <strong>{member.name}</strong>
                    <span>
                      {member.path}
                      {!member.listed && <i>unlisted</i>}
                    </span>
                  </span>
                  <span className="links">
                    <Link to={member.path} className="rule-link">
                      view
                    </Link>
                    <Link to={`${member.path}/edit`} className="rule-link">
                      edit
                    </Link>
                  </span>
                </article>
              ))}
            </div>
          </Band>
        </div>
        <div id="errors">
          <Band title="errors">
            <div className="errors">
              {open.length === 0 && <p className="mono-sm text-faint">nothing open</p>}
              {open.map((error) => (
                <ErrorRow key={error.fingerprint} error={error} csrf={csrf} />
              ))}
              {resolved.length > 0 && (
                <details className="resolved">
                  <summary>resolved · {resolved.length}</summary>
                  {resolved.map((error) => (
                    <ErrorRow key={error.fingerprint} error={error} csrf={csrf} />
                  ))}
                </details>
              )}
            </div>
          </Band>
        </div>
      </div>
    </Page>
  );
}
