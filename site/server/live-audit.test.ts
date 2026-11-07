import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it, mock } from 'node:test';
import {
  MAX_TOPICS,
  revalidates,
  ROOT_TOPICS,
  ROUTE_TOPICS,
  subscription,
  TOPICS,
  topicsFor,
  type RouteName,
  type Topic,
} from '../app/topics.ts';
import type { HubEvent } from './bus.ts';
import { createClient, parseTopics } from './live.ts';

const DIRECTORY: Topic[] = ['members', 'profiles', 'projects', 'releases', 'settings', 'posts'];
const EVERY_PAGE: Topic[] = [...DIRECTORY, 'presence', 'views'];
const RAIL: Topic[] = ['deploys', 'uptime'];

const DEPENDS: Record<RouteName, Topic[]> = {
  home: [...EVERY_PAGE, ...RAIL, 'stats', 'messages'],
  members: [...EVERY_PAGE, ...RAIL],
  member: [...EVERY_PAGE, ...RAIL],
  epics: [...EVERY_PAGE, ...RAIL],
  projects: [...EVERY_PAGE, ...RAIL],
  resolved: [...EVERY_PAGE, ...RAIL, 'reading'],
  changelog: EVERY_PAGE,
  'member-changelog': EVERY_PAGE,
  'project-changelog': EVERY_PAGE,
  status: [...EVERY_PAGE, ...RAIL, 'ping', 'map'],
  admin: [...EVERY_PAGE, 'errors', 'subscribers'],
  messages: [...EVERY_PAGE, 'messages'],
  blog: EVERY_PAGE,
  author: EVERY_PAGE,
  post: [...EVERY_PAGE, 'reading', 'editing'],
  'blog-new': EVERY_PAGE,
  'blog-mine': EVERY_PAGE,
  'post-editor': EVERY_PAGE,
  editor: EVERY_PAGE,
  subscribe: EVERY_PAGE,
  subscription: EVERY_PAGE,
  search: EVERY_PAGE,
  privacy: EVERY_PAGE,
  'sign-in': EVERY_PAGE,
  kit: EVERY_PAGE,
  'not-found': EVERY_PAGE,
};

const KEY = 'sample-key';

const event = (topic: Topic): HubEvent => ({
  topic,
  key: KEY,
  kind: topic,
  public: true,
  summary: topic,
  detail: {},
  at: '2026-11-07T00:00:00.000Z',
});

function subscribed(route: RouteName) {
  const keyed = () => KEY;
  return subscription(
    [{ topics: ROOT_TOPICS }, topicsFor(route, { reading: keyed, editing: keyed })],
    [
      { loaderData: undefined, params: {} },
      { loaderData: undefined, params: {} },
    ],
  ).topics;
}

const source = (file: string) => readFileSync(new URL(`../app/${file}`, import.meta.url), 'utf8');

describe('live audit', () => {
  const routes = [...source('routes.ts').matchAll(/'routes\/([a-z-]+)\.tsx'/g)].map(
    ([, name]) => name,
  );

  it('maps every component route and nothing else', () => {
    assert.deepEqual([...new Set(routes)].sort(), Object.keys(ROUTE_TOPICS).sort());
  });

  it('every route module declares its handle from the map', () => {
    for (const route of new Set(routes)) {
      assert.match(
        source(`routes/${route}.tsx`),
        new RegExp(`export const handle = topicsFor\\('${route}'`),
        `${route} does not use topicsFor`,
      );
    }
    assert.match(source('root.tsx'), /handle: LiveHandle = \{ topics: ROOT_TOPICS \}/);
  });

  it('every route stays within the stream cap and the server accepts its subscription', () => {
    for (const route of Object.keys(ROUTE_TOPICS) as RouteName[]) {
      const topics = subscribed(route);
      assert.ok(topics.length <= MAX_TOPICS, `${route} asks for ${topics.length} topics`);
      assert.deepEqual(parseTopics(topics.join(',')), topics);
    }
  });

  it('firing each topic reaches exactly the routes that depend on it', () => {
    mock.timers.enable({ apis: ['setTimeout'] });
    for (const topic of TOPICS) {
      for (const route of Object.keys(ROUTE_TOPICS) as RouteName[]) {
        const frames: string[] = [];
        const client = createClient(
          (chunk) => frames.push(chunk),
          subscribed(route),
          false,
          undefined,
        );
        client.offer({ id: '1-0', event: event(topic) });
        mock.timers.tick(100);
        const expected = DEPENDS[route].includes(topic);
        assert.equal(
          frames.length,
          expected ? 1 : 0,
          `${topic} ${expected ? 'should reach' : 'should not reach'} ${route}`,
        );
      }
    }
    mock.timers.reset();
  });

  it('sessions reach no route by subscription; the stream pushes them to members', () => {
    for (const route of Object.keys(ROUTE_TOPICS) as RouteName[]) {
      assert.ok(!DEPENDS[route].includes('sessions'));
    }
  });

  it('patched topics change the DOM from their payload; the rest revalidate the loaders', () => {
    for (const topic of ['presence', 'reading', 'editing', 'views', 'ping', 'map']) {
      assert.ok(!revalidates(topic), `${topic} must patch in place`);
    }
    for (const topic of TOPICS.filter(
      (entry) => !['presence', 'reading', 'editing', 'views', 'ping', 'map'].includes(entry),
    )) {
      assert.ok(revalidates(topic), `${topic} must revalidate`);
    }
  });
});
