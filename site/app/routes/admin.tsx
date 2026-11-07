import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { data, Link, redirect, useFetcher } from 'react-router';
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
  type ChoiceSetting,
  type ColorsSetting,
  type NumberSetting,
  type OrderItem,
  type SetSetting,
  type Setting,
  type SettingKey,
  type TextSetting,
} from '../settings';
import { describeScope, parseScope, validEmail } from '../subscribe';
import { topicsFor } from '../topics';

export const handle = topicsFor('admin');

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
    email: hub.subscribers.overview(),
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
        await hub.admin.signOutEveryone(viewer.login);
        throw redirect('/');
      case 'test-email': {
        const to = String(form.get('to') ?? '')
          .trim()
          .toLowerCase();
        const kind = String(form.get('kind'));
        if (!validEmail(to) || !['confirm', 'post', 'digest'].includes(kind)) {
          return data({ error: 'Type an address to send the test to.', key }, { status: 400 });
        }
        await hub.subscribers.sendTest(kind as 'confirm' | 'post' | 'digest', to);
        return { ok: `${kind} sent to ${to}`, key: 'test-email' };
      }
    }
  } catch (error) {
    if (error instanceof Response) {
      throw error;
    }
    return data(
      { error: error instanceof Error ? error.message : String(error), key },
      { status: 400 },
    );
  }
  return { ok: 'saved', key };
}

const AREAS: Record<Area, string> = {
  site: 'site',
  home: 'home page',
  rail: 'rail',
  blog: 'blog',
  email: 'email',
};

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

function ChoiceControl({ setting, value, commit }: ControlProps<ChoiceSetting, string>) {
  return (
    <Segmented
      options={setting.options.map((option) => [option, option] as const)}
      value={value}
      choose={commit}
      label={setting.label}
    />
  );
}

function Control(props: ControlProps<Setting, unknown>) {
  switch (props.setting.kind) {
    case 'choice':
      return <ChoiceControl {...(props as ControlProps<ChoiceSetting, string>)} />;
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

const EMAIL_KINDS = [
  ['post', 'new post'],
  ['digest', 'digest'],
  ['confirm', 'confirmation'],
] as const;

function EmailStudio({ csrf, testTo }: { csrf: string; testTo: string }) {
  const settings = useRoot()!.settings;
  const [kind, setKind] = useState<(typeof EMAIL_KINDS)[number][0]>('post');
  const test = useFetcher<typeof action>();
  const version = JSON.stringify(
    Object.entries(settings).filter(([key]) => key.startsWith('email.') || key === 'site.name'),
  );
  const result =
    test.data && 'key' in test.data && test.data.key === 'test-email' ? test.data : null;
  return (
    <div className="studio">
      <div className="window screen mail">
        <div className="bar">
          <i />
          <i />
          <i />
          <Segmented options={EMAIL_KINDS} value={kind} choose={setKind} label="Email to preview" />
        </div>
        <iframe
          key={`${kind}${version}`}
          src={`/admin/email?kind=${kind}`}
          title={`Preview of the ${kind} email`}
          className="mail-preview"
        />
        <test.Form method="post" className="foot">
          <input type="hidden" name="csrf" value={csrf} />
          <input type="hidden" name="intent" value="test-email" />
          <input type="hidden" name="kind" value={kind} />
          <input
            type="email"
            name="to"
            defaultValue={testTo}
            placeholder="you@somewhere.com"
            aria-label="Send the test to"
            className="field"
          />
          <button type="submit" className="chip-button" disabled={test.state !== 'idle'}>
            {test.state !== 'idle' ? 'sending' : 'send a test'}
          </button>
          {result && 'ok' in result && <span className="text-live">{result.ok}</span>}
          {result && 'error' in result && <span className="text-danger">{result.error}</span>}
        </test.Form>
      </div>
    </div>
  );
}

function Subscribers({ email }: { email: Route.ComponentProps['loaderData']['email'] }) {
  const root = useRoot()!;
  return (
    <div className="mailroom">
      <div className="mail-facts">
        <Fact value={email.confirmed} label="confirmed" />
        <Fact value={email.pending} label="waiting to confirm" />
        <Fact value={email.each} label="per post" />
        <Fact value={email.weekly} label="weekly" />
        <Fact value={email.unsubscribed} label="left" />
        <Fact value={email.sends.queued} label="queued" />
        <Fact value={email.sends.today} label="sent today" />
        {email.nextDigestAt && <Fact label="next digest" value={when(email.nextDigestAt)} />}
      </div>
      {email.scopes.length > 0 && (
        <div className="chips scopes">
          {email.scopes.map(({ scope, count }) => (
            <span key={scope} className="tag">
              {describeScope(parseScope(scope) ?? { kind: 'all' }, root.directory)}
              <b>{count}</b>
            </span>
          ))}
        </div>
      )}
      <div className="mail-lists">
        <div>
          <h3 className="setting-label">recent sends</h3>
          {email.recent.length === 0 ? (
            <p className="mono-sm text-faint">nothing sent yet</p>
          ) : (
            <ol className="sends">
              {email.recent.map((send) => (
                <li key={send.id} data-status={send.status}>
                  <span className="status" data-status={send.status}>
                    {send.status}
                  </span>
                  <span className="kind" data-kind={send.kind}>
                    {send.kind}
                  </span>
                  <span className="who">{send.email}</span>
                  <span className="when">
                    {when(send.at)}
                    {send.attempts > 1 && ` · ${send.attempts} tries`}
                  </span>
                  {send.error && <span className="why">{send.error}</span>}
                </li>
              ))}
            </ol>
          )}
        </div>
        <div>
          <h3 className="setting-label">bounces</h3>
          {email.bounces.length === 0 ? (
            <p className="mono-sm text-faint">no address has bounced</p>
          ) : (
            <ol className="sends">
              {email.bounces.map((bounce) => (
                <li key={bounce.id} data-status="bounced">
                  <span className="status" data-status="bounced">
                    suppressed
                  </span>
                  <span className="who">{bounce.email}</span>
                  <span className="when">{when(bounce.at)}</span>
                  <span className="why">{bounce.reason}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}

function Sessions({ csrf }: { csrf: string }) {
  const signOut = useFetcher<typeof action>();
  return (
    <Panel title="sessions">
      <Confirm
        label="sign everyone out"
        sure="sure? everyone, you included"
        disabled={signOut.state !== 'idle'}
        act={() => signOut.submit({ csrf, intent: 'sign-out-everyone' }, { method: 'post' })}
      />
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
    ['subscribers', `subscribers · ${loaderData.email.confirmed}`],
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
              <Fact value={loaderData.email.confirmed} label="subscribers" />
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
              {area === 'email' && <EmailStudio csrf={csrf} testTo={loaderData.email.testTo} />}
            </Band>
          </div>
        ))}
        <div id="subscribers">
          <Band title="subscribers">
            <Subscribers email={loaderData.email} />
          </Band>
        </div>
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
