import { useState } from 'react';
import { data, Link, useSearchParams } from 'react-router';
import type { Route } from './+types/subscribe';
import { Button, Panel } from '../components/kit/basics';
import { Editable } from '../components/kit/Editable';
import { Fact, PageHeader } from '../components/kit/page';
import { PostRow } from '../components/kit/posts';
import { Chooser, SubscribeForm } from '../components/kit/subscribe';
import { Page } from '../components/Shell';
import { hubContext } from '../context';
import { useHub } from '../hub';
import { isCadence, knownScope, parseScope, type Cadence, type Scope } from '../subscribe';
import { topicsFor } from '../topics';

export const handle = topicsFor('subscribe');

export function loader({ context }: Route.LoaderArgs) {
  const hub = context.get(hubContext);
  return { readers: hub.subscribers.count() };
}

export async function action({ context, request }: Route.ActionArgs) {
  const hub = context.get(hubContext);
  if (request.headers.get('origin') !== hub.origin) {
    throw data(null, { status: 403 });
  }
  const form = await request.formData();
  if (form.get('intent') !== 'subscribe') {
    throw data(null, { status: 400 });
  }
  const outcome = await hub.subscribers.subscribe({
    email: String(form.get('email') ?? ''),
    scope: String(form.get('scope') ?? 'all'),
    cadence: String(form.get('cadence') ?? 'each'),
    trap: String(form.get('website') ?? ''),
    address: hub.address,
  });
  return outcome.ok ? { sent: true as const } : data({ reason: outcome.reason }, { status: 400 });
}

export default function Subscribe({ loaderData }: Route.ComponentProps) {
  const hub = useHub();
  const [params] = useSearchParams();
  const wanted = parseScope(params.get('scope') ?? 'all');
  const [scope, setScope] = useState<Scope>(
    wanted && knownScope(wanted, hub) ? wanted : { kind: 'all' },
  );
  const [cadence, setCadence] = useState<Cadence>(
    isCadence(params.get('cadence')) ? (params.get('cadence') as Cadence) : 'each',
  );
  const writers = new Set(hub.posts.map((post) => post.author)).size;

  return (
    <Page
      rail={
        <>
          {hub.posts.length > 0 && (
            <Panel title="lately" link={{ to: '/blog', label: 'the blog' }}>
              <div className="post-rows">
                {hub.posts.slice(0, 5).map((post) => (
                  <PostRow key={post.id} post={post} />
                ))}
              </div>
            </Panel>
          )}
          <Panel title="the deal">
            <ul className="deal">
              <li>one email per post, or one a week</li>
              <li>unsubscribe in one click, from any email</li>
              <li>your address is kept until you leave, plus 30 days</li>
            </ul>
            <Link to="/privacy" className="rule-link mono-sm">
              what this site keeps
            </Link>
          </Panel>
        </>
      }
    >
      <div className="subscribe">
        <PageHeader
          path="/subscribe"
          title="Subscribe"
          subtitle={<Editable setting="subscribe.intro" />}
          actions={
            <Button to="/blog/feed.xml" arrow>
              rss instead
            </Button>
          }
          facts={
            <>
              <Fact value={loaderData.readers} label="by email" />
              <Fact value={hub.posts.length} label="posts" />
              <Fact value={writers} label="writers" />
            </>
          }
        />
        <section className="band">
          <Chooser scope={scope} cadence={cadence} onScope={setScope} onCadence={setCadence} />
          <SubscribeForm scope={scope} cadence={cadence} />
        </section>
      </div>
    </Page>
  );
}
