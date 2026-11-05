import { useState } from 'react';
import { data, Link, useFetcher } from 'react-router';
import type { Route } from './+types/admin';
import { Panel } from '../components/kit/basics';
import { PageHero } from '../components/kit/page';
import Section from '../components/Section';
import { Page } from '../components/Shell';
import { hubContext, type Hub } from '../context';
import { useRoot } from '../hub';
import {
  isSettingKey,
  SETTINGS,
  type Area,
  type OrderItem,
  type Setting,
  type SettingKey,
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
  return { ok: 'Saved.', key };
}

const AREAS: Record<Area, string> = { site: 'site', home: 'home page', rail: 'rail' };

function Control({
  setting,
  value,
  onChange,
}: {
  setting: Setting;
  value: unknown;
  onChange: (next: unknown) => void;
}) {
  const input = 'w-full rounded-md border border-line bg-paper px-3 py-2 text-ink';
  switch (setting.kind) {
    case 'text':
      return setting.multiline ? (
        <textarea
          className={input}
          rows={3}
          maxLength={setting.max}
          value={value as string}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <input
          className={input}
          maxLength={setting.max}
          value={value as string}
          onChange={(event) => onChange(event.target.value)}
        />
      );
    case 'number':
      return (
        <input
          className={`${input} max-w-32`}
          type="number"
          min={setting.min}
          max={setting.max}
          value={value as number}
          onChange={(event) => onChange(Number(event.target.value))}
        />
      );
    case 'order': {
      const items = value as OrderItem[];
      const move = (from: number, to: number) => {
        const next = [...items];
        next.splice(to, 0, ...next.splice(from, 1));
        onChange(next);
      };
      return (
        <ol className="grid gap-1">
          {items.map((item, index) => (
            <li
              key={item.id}
              className="mono-sm flex items-center gap-2 rounded-md border border-line-soft px-2 py-1"
            >
              <input
                type="checkbox"
                checked={item.on}
                aria-label={`Show ${item.id}`}
                onChange={() =>
                  onChange(
                    items.map((other) =>
                      other.id === item.id ? { ...other, on: !other.on } : other,
                    ),
                  )
                }
              />
              <span className={`flex-1 ${item.on ? 'text-ink' : 'text-faint line-through'}`}>
                {item.id}
              </span>
              <button
                type="button"
                disabled={index === 0}
                onClick={() => move(index, index - 1)}
                aria-label={`Move ${item.id} up`}
              >
                ↑
              </button>
              <button
                type="button"
                disabled={index === items.length - 1}
                onClick={() => move(index, index + 1)}
                aria-label={`Move ${item.id} down`}
              >
                ↓
              </button>
            </li>
          ))}
        </ol>
      );
    }
    case 'set': {
      const chosen = value as string[];
      return (
        <div className="mono-sm flex flex-wrap gap-3">
          {setting.options.map((option) => (
            <label key={option} className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={chosen.includes(option)}
                onChange={() =>
                  onChange(
                    chosen.includes(option)
                      ? chosen.filter((item) => item !== option)
                      : [...chosen, option],
                  )
                }
              />
              {option}
            </label>
          ))}
        </div>
      );
    }
    case 'colors': {
      const colours = value as string[];
      return (
        <div className="flex flex-wrap gap-2">
          {colours.map((colour, index) => (
            <input
              key={index}
              type="color"
              value={colour}
              aria-label={`Accent ${index + 1}`}
              onChange={(event) =>
                onChange(colours.map((other, at) => (at === index ? event.target.value : other)))
              }
            />
          ))}
        </div>
      );
    }
  }
}

function SettingRow({ settingKey, csrf }: { settingKey: SettingKey; csrf: string }) {
  const stored = useRoot()!.settings[settingKey];
  const setting: Setting = SETTINGS[settingKey];
  const [draft, setDraft] = useState<unknown>(stored);
  const [base, setBase] = useState<unknown>(stored);
  const fetcher = useFetcher<typeof action>();
  if (JSON.stringify(base) !== JSON.stringify(stored)) {
    setBase(stored);
    setDraft(stored);
  }
  const changed = JSON.stringify(draft) !== JSON.stringify(stored);
  const result =
    fetcher.data && 'key' in fetcher.data && fetcher.data.key === settingKey ? fetcher.data : null;

  return (
    <fetcher.Form method="post" className="grid gap-2 border-b border-line-soft py-4">
      <input type="hidden" name="csrf" value={csrf} />
      <input type="hidden" name="key" value={settingKey} />
      <input type="hidden" name="value" value={JSON.stringify(draft)} />
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <label className="font-semibold">{setting.label}</label>
        <span className="mono-sm text-faint">{settingKey}</span>
      </div>
      <Control setting={setting} value={draft} onChange={setDraft} />
      <div className="mono-sm flex flex-wrap items-center gap-4">
        <button
          type="submit"
          name="intent"
          value="set"
          disabled={!changed || fetcher.state !== 'idle'}
          className="btn primary disabled:opacity-40"
        >
          save
        </button>
        <button type="submit" name="intent" value="reset" className="rule-link">
          reset to default
        </button>
        <Link to={`?history=${settingKey}`} className="rule-link" preventScrollReset>
          history
        </Link>
        {result && 'error' in result && <span className="text-danger">{result.error}</span>}
        {result && 'ok' in result && !changed && <span className="text-live">{result.ok}</span>}
      </div>
    </fetcher.Form>
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
    <Page
      rail={
        <>
          <Panel title={loaderData.history ? `history · ${loaderData.history.key}` : 'history'}>
            {loaderData.history ? (
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
            ) : (
              <p className="mono-sm text-faint">Choose history on a setting to see its versions.</p>
            )}
          </Panel>
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
        </>
      }
    >
      <PageHero crumb="/admin" title="Admin">
        <p className="lede">
          Every setting on the site. A save is live on every open tab within a second and kept as a
          version you can revert.
        </p>
      </PageHero>
      {(Object.keys(AREAS) as Area[]).map((area) => (
        <Section key={area} label={AREAS[area]}>
          {keys
            .filter((key) => SETTINGS[key].area === area)
            .map((key) => (
              <SettingRow key={key} settingKey={key} csrf={csrf} />
            ))}
        </Section>
      ))}
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
                  <button type="submit" name="intent" value="resolve" className="rule-link mono-sm">
                    resolve
                  </button>
                </resolve.Form>
              )}
            </article>
          ))}
        </div>
      </Section>
    </Page>
  );
}
