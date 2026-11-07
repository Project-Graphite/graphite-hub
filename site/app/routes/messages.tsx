import { data, useFetcher } from 'react-router';
import type { Route } from './+types/messages';
import { accentStyle, Panel } from '../components/kit/basics';
import { Editable } from '../components/kit/Editable';
import { Fact, PageHeader } from '../components/kit/page';
import { Page } from '../components/Shell';
import { hubContext } from '../context';
import { day } from '../format';
import { useRoot } from '../hub';
import { useSpotlight } from '../motion/motion';
import { topicsFor } from '../topics';
import type { Message } from '../types';

export const handle = topicsFor('messages');

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
    <fetcher.Form method="post" className="moderate">
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

function Note({ message, accent, csrf }: { message: Message; accent: string; csrf?: string }) {
  const spot = useSpotlight<HTMLElement>();
  return (
    <article ref={spot} className="note spot" style={accentStyle(accent)}>
      <p>{message.body}</p>
      <footer>
        <span className="who">{message.name ?? 'someone'}</span>
        <time dateTime={message.at}>{day(message.at)}</time>
      </footer>
      {csrf && <Moderate message={message} csrf={csrf} />}
    </article>
  );
}

function Leave() {
  const leave = useFetcher<typeof action>();
  const sent = leave.data && 'sent' in leave.data;
  return (
    <Panel title="leave a message">
      <Editable as="p" className="intro" setting="messages.intro" />
      {sent ? (
        <p className="sent">Sent. A member reads every message.</p>
      ) : (
        <leave.Form method="post" className="leave">
          <input type="hidden" name="intent" value="leave" />
          <input name="name" maxLength={60} placeholder="name" className="field" />
          <textarea
            name="body"
            required
            maxLength={LIMIT}
            rows={4}
            placeholder="message"
            className="field"
          />
          <input
            name="website"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            className="absolute -left-[9999px]"
          />
          <div className="foot">
            <span className="choice">
              <label>
                <input type="radio" name="visibility" value="public" defaultChecked />
                on the wall
              </label>
              <label>
                <input type="radio" name="visibility" value="private" />
                members only
              </label>
            </span>
            <button type="submit" className="btn primary" disabled={leave.state !== 'idle'}>
              send <span className="arrow">→</span>
            </button>
          </div>
          {leave.data && 'reason' in leave.data && (
            <p className="mono-sm text-danger">{leave.data.reason}</p>
          )}
        </leave.Form>
      )}
    </Panel>
  );
}

export default function Messages({ loaderData }: Route.ComponentProps) {
  const root = useRoot()!;
  const { wall, queue } = loaderData;
  const accents = root.settings['site.accents'];
  const accentOf = (message: Message) => accents[message.id % accents.length];
  const csrf = root.viewer ? (root.csrf ?? '') : undefined;

  return (
    <Page rail={<Leave />}>
      <PageHeader
        path="/messages"
        title="Messages"
        facts={
          <>
            <Fact value={wall.length} label="on the wall" />
            {queue && <Fact value={queue.length} label="waiting" />}
          </>
        }
      />
      {queue && queue.length > 0 && (
        <section className="queue">
          <div className="head">
            <span>
              <b>{queue.length}</b> waiting
            </span>
          </div>
          <div className="notes">
            {queue.map((message) => (
              <div key={message.id} className="held">
                <span className="kind">{message.public ? 'off the wall' : 'private'}</span>
                <Note message={message} accent={accentOf(message)} csrf={csrf} />
              </div>
            ))}
          </div>
        </section>
      )}
      <section className="notes wall-notes">
        {wall.length === 0 && <p className="mono-sm text-faint">nothing on the wall yet</p>}
        {wall.map((message) => (
          <Note key={message.id} message={message} accent={accentOf(message)} csrf={csrf} />
        ))}
      </section>
    </Page>
  );
}
