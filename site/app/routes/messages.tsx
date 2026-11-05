import { data, useFetcher } from 'react-router';
import type { Route } from './+types/messages';
import { PageHero } from '../components/kit/page';
import Section from '../components/Section';
import { Page } from '../components/Shell';
import { hubContext } from '../context';
import { useRoot } from '../hub';
import type { Message } from '../types';

export const handle = { topics: ['messages'] };

const LIMIT = 1000;

export function loader({ context }: Route.LoaderArgs) {
  const hub = context.get(hubContext);
  return { wall: hub.messages.wall(100), queue: hub.viewer ? hub.messages.queue() : null };
}

export async function action({ context, request }: Route.ActionArgs) {
  const hub = context.get(hubContext);
  const form = await request.formData();
  if (request.headers.get('origin') !== hub.origin) {
    throw data(null, { status: 403 });
  }
  const intent = form.get('intent');
  if (intent === 'leave') {
    const left = await hub.messages.leave({
      name: String(form.get('name') ?? ''),
      body: String(form.get('body') ?? ''),
      public: form.get('visibility') === 'public',
      trap: String(form.get('website') ?? ''),
      address: hub.address,
    });
    return left.ok ? { sent: true } : data({ reason: left.reason }, { status: 400 });
  }
  if (!hub.viewer || form.get('csrf') !== hub.csrf) {
    throw data(null, { status: 403 });
  }
  const id = Number(form.get('id'));
  if (intent === 'publish') {
    await hub.messages.publish(id, hub.viewer.login);
  } else if (intent === 'unpublish') {
    await hub.messages.unpublish(id);
  } else if (intent === 'delete') {
    await hub.messages.remove(id);
  }
  return { done: true };
}

function Moderate({ message, csrf }: { message: Message; csrf: string }) {
  const fetcher = useFetcher();
  return (
    <fetcher.Form method="post" className="mono-sm flex flex-wrap gap-4">
      <input type="hidden" name="csrf" value={csrf} />
      <input type="hidden" name="id" value={message.id} />
      {message.publishedAt ? (
        <button type="submit" name="intent" value="unpublish" className="rule-link">
          take off the wall
        </button>
      ) : (
        message.public && (
          <button type="submit" name="intent" value="publish" className="rule-link">
            publish
          </button>
        )
      )}
      <button type="submit" name="intent" value="delete" className="rule-link text-danger">
        delete
      </button>
    </fetcher.Form>
  );
}

function Note({ message, csrf }: { message: Message; csrf?: string }) {
  return (
    <article className="panel grid gap-2">
      <div className="mono-sm flex flex-wrap items-baseline justify-between gap-3 text-faint">
        <span>{message.name ?? 'someone'}</span>
        <time dateTime={message.at}>{message.at.slice(0, 10)}</time>
      </div>
      <p className="whitespace-pre-line text-muted">{message.body}</p>
      {csrf && <Moderate message={message} csrf={csrf} />}
    </article>
  );
}

export default function Messages({ loaderData }: Route.ComponentProps) {
  const root = useRoot()!;
  const leave = useFetcher<typeof action>();
  const sent = leave.data && 'sent' in leave.data;
  const csrf = root.viewer ? (root.csrf ?? '') : undefined;

  return (
    <Page>
      <PageHero crumb="/messages" title="Messages">
        <p className="lede">{root.settings['messages.intro']}</p>
      </PageHero>

      <Section label="leave a message">
        {sent ? (
          <p className="text-live">Thank you. A member reads every message.</p>
        ) : (
          <leave.Form method="post" className="grid max-w-[52ch] gap-3">
            <input type="hidden" name="intent" value="leave" />
            <input
              name="name"
              maxLength={60}
              placeholder="your name, if you like"
              className="rounded-md border border-line bg-paper px-3 py-2 text-ink"
            />
            <textarea
              name="body"
              required
              maxLength={LIMIT}
              rows={5}
              placeholder="your message"
              className="rounded-md border border-line bg-paper px-3 py-2 text-ink"
            />
            <input
              name="website"
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              className="absolute -left-[9999px]"
            />
            <fieldset className="mono-sm flex flex-wrap gap-4 text-muted">
              <label className="flex items-center gap-1.5">
                <input type="radio" name="visibility" value="public" defaultChecked /> on the wall
              </label>
              <label className="flex items-center gap-1.5">
                <input type="radio" name="visibility" value="private" /> only for the members
              </label>
            </fieldset>
            <div className="flex items-center gap-4">
              <button type="submit" className="btn primary" disabled={leave.state !== 'idle'}>
                send <span className="arrow">→</span>
              </button>
              {leave.data && 'reason' in leave.data && (
                <span className="mono-sm text-danger">{leave.data.reason}</span>
              )}
            </div>
          </leave.Form>
        )}
      </Section>

      {loaderData.queue && (
        <Section label={`waiting · ${loaderData.queue.length}`}>
          <div className="grid gap-3">
            {loaderData.queue.length === 0 && (
              <p className="mono-sm text-faint">Nothing is waiting.</p>
            )}
            {loaderData.queue.map((message) => (
              <div key={message.id} className="grid gap-1">
                <span className="mono-sm text-faint">
                  {message.public ? 'public, off the wall' : 'private'}
                </span>
                <Note message={message} csrf={csrf} />
              </div>
            ))}
          </div>
        </Section>
      )}

      <Section label={`the wall · ${loaderData.wall.length}`}>
        <div className="band-grid two mt-0 auto-rows-auto items-start">
          {loaderData.wall.length === 0 && (
            <p className="mono-sm text-faint">Nothing on the wall yet.</p>
          )}
          {loaderData.wall.map((message) => (
            <Note key={message.id} message={message} csrf={csrf} />
          ))}
        </div>
      </Section>
    </Page>
  );
}
