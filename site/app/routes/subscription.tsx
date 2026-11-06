import { useState } from 'react';
import { data, Link, redirect, useFetcher } from 'react-router';
import type { Route } from './+types/subscription';
import { Button } from '../components/kit/basics';
import { Confirm } from '../components/kit/controls';
import { Fact, PageHeader } from '../components/kit/page';
import { Chooser } from '../components/kit/subscribe';
import { Page } from '../components/Shell';
import { hubContext, type Hub } from '../context';
import { day } from '../format';
import { useHub } from '../hub';
import { describeChoice, parseScope, scopeKey, type Cadence, type Scope } from '../subscribe';

export const handle = { topics: ['members', 'projects'] };

function verified(hub: Hub, params: Route.LoaderArgs['params']) {
  const subscriber = hub.subscribers.verify(params.purpose, params.id, params.sig);
  if (!subscriber) {
    throw data(null, { status: 404 });
  }
  return subscriber;
}

export async function loader({ context, params, request }: Route.LoaderArgs) {
  const hub = context.get(hubContext);
  const subscriber = verified(hub, params);
  if (params.purpose === 'confirm') {
    await hub.subscribers.confirm(subscriber.id);
    throw redirect(`${hub.subscribers.link('manage', subscriber)}?confirmed`);
  }
  return {
    page: params.purpose as 'manage' | 'unsubscribe',
    email: subscriber.email,
    scope: subscriber.scope,
    cadence: subscriber.cadence,
    since: subscriber.confirmedAt ?? subscriber.createdAt,
    active: Boolean(subscriber.confirmedAt && !subscriber.unsubscribedAt),
    confirmed: new URL(request.url).searchParams.has('confirmed'),
  };
}

export async function action({ context, params, request }: Route.ActionArgs) {
  const hub = context.get(hubContext);
  const subscriber = verified(hub, params);
  const form = await request.formData();
  const intent = form.has('List-Unsubscribe') ? 'unsubscribe' : form.get('intent');
  if (intent !== 'unsubscribe' && request.headers.get('origin') !== hub.origin) {
    throw data(null, { status: 403 });
  }
  switch (intent) {
    case 'unsubscribe':
      await hub.subscribers.unsubscribe(subscriber.id);
      return { ok: 'unsubscribed' as const };
    case 'resubscribe':
      await hub.subscribers.resubscribe(subscriber.id);
      return { ok: 'resubscribed' as const };
    case 'save': {
      const saved = await hub.subscribers.update(
        subscriber.id,
        String(form.get('scope') ?? ''),
        String(form.get('cadence') ?? ''),
      );
      return saved.ok ? { ok: 'saved' as const } : data({ reason: saved.reason }, { status: 400 });
    }
  }
  throw data(null, { status: 400 });
}

function Membership({
  active,
  disabled,
  act,
}: {
  active: boolean;
  disabled: boolean;
  act: (intent: 'unsubscribe' | 'resubscribe') => void;
}) {
  return active ? (
    <Confirm
      label="unsubscribe"
      sure="sure? no more emails"
      disabled={disabled}
      act={() => act('unsubscribe')}
    />
  ) : (
    <button
      type="button"
      className="btn primary"
      disabled={disabled}
      onClick={() => act('resubscribe')}
    >
      subscribe again <span className="arrow">→</span>
    </button>
  );
}

export default function Subscription({ loaderData }: Route.ComponentProps) {
  const hub = useHub();
  const fetcher = useFetcher<typeof action>();
  const [scope, setScope] = useState<Scope>(parseScope(loaderData.scope) ?? { kind: 'all' });
  const [cadence, setCadence] = useState<Cadence>(loaderData.cadence);
  const busy = fetcher.state !== 'idle';
  const outcome = fetcher.data && 'ok' in fetcher.data ? fetcher.data.ok : null;
  const reason = fetcher.data && 'reason' in fetcher.data ? fetcher.data.reason : null;
  const act = (intent: 'unsubscribe' | 'resubscribe') =>
    fetcher.submit({ intent }, { method: 'post' });
  const banner = loaderData.confirmed
    ? 'confirmed'
    : outcome === 'unsubscribed'
      ? 'off the list'
      : outcome === 'resubscribed'
        ? 'back on'
        : outcome === 'saved'
          ? 'saved'
          : null;

  if (loaderData.page === 'unsubscribe') {
    return (
      <Page>
        <div className="subscribe">
          <PageHeader
            path="/subscribe"
            title={loaderData.active ? 'Unsubscribe?' : 'You are off the list'}
            subtitle={loaderData.email}
            facts={
              <Fact
                label={loaderData.active ? 'getting' : 'was getting'}
                value={describeChoice(
                  parseScope(loaderData.scope) ?? { kind: 'all' },
                  loaderData.cadence,
                  hub,
                )}
              />
            }
          />
          <section className="band leave-band">
            {loaderData.active ? (
              <>
                <button
                  type="button"
                  className="btn primary"
                  disabled={busy}
                  onClick={() => act('unsubscribe')}
                >
                  unsubscribe <span className="arrow">→</span>
                </button>
                <Button to={hub.posts[0]?.path ?? '/blog'}>keep reading instead</Button>
              </>
            ) : (
              <>
                <Membership active={false} disabled={busy} act={act} />
                <Button to="/blog">the blog</Button>
              </>
            )}
          </section>
        </div>
      </Page>
    );
  }

  return (
    <Page>
      <div className="subscribe">
        <PageHeader
          path="/subscribe"
          title="Your subscription"
          subtitle={loaderData.email}
          aside={banner && <span className="tag live">{banner}</span>}
          facts={
            <>
              <Fact label="since" value={day(loaderData.since)} />
              <Fact label="status" value={loaderData.active ? 'on' : 'off'} />
            </>
          }
        />
        <section className="band">
          <Chooser scope={scope} cadence={cadence} onScope={setScope} onCadence={setCadence} />
          <fetcher.Form method="post" className="manage-row">
            <input type="hidden" name="intent" value="save" />
            <input type="hidden" name="scope" value={scopeKey(scope)} />
            <input type="hidden" name="cadence" value={cadence} />
            <button type="submit" className="btn primary" disabled={busy || !loaderData.active}>
              save <span className="arrow">→</span>
            </button>
            <Membership active={loaderData.active} disabled={busy} act={act} />
            {reason && <span className="mono-sm text-danger">{reason}</span>}
          </fetcher.Form>
          <p className="mono-sm text-faint">
            <Link to="/blog" className="rule-link">
              the blog
            </Link>
            {' · '}
            <Link to="/privacy" className="rule-link">
              what this site keeps
            </Link>
          </p>
        </section>
      </div>
    </Page>
  );
}
