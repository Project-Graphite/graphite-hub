export const TOPICS = [
  'members',
  'profiles',
  'projects',
  'releases',
  'settings',
  'posts',
  'sessions',
  'deploys',
  'uptime',
  'ping',
  'stats',
  'messages',
  'errors',
  'subscribers',
  'console',
  'presence',
  'reading',
  'editing',
  'views',
  'map',
] as const;

export type Topic = (typeof TOPICS)[number];

export const MAX_TOPICS = 12;

export const PATCHED: ReadonlySet<Topic> = new Set<Topic>([
  'presence',
  'reading',
  'editing',
  'views',
  'ping',
  'map',
]);

export function revalidates(topic: string) {
  return !PATCHED.has(topic as Topic);
}

const DIRECTORY: Topic[] = ['members', 'profiles', 'projects', 'releases', 'settings', 'posts'];
export const ROOT_TOPICS: Topic[] = [...DIRECTORY, 'presence', 'views'];
const RAIL: Topic[] = ['deploys', 'uptime'];

export const ROUTE_TOPICS = {
  home: [...ROOT_TOPICS, ...RAIL, 'stats', 'messages'],
  members: [...ROOT_TOPICS, ...RAIL],
  member: [...ROOT_TOPICS, ...RAIL],
  epics: [...ROOT_TOPICS, ...RAIL],
  projects: [...ROOT_TOPICS, ...RAIL],
  resolved: [...ROOT_TOPICS, ...RAIL, 'reading'],
  changelog: ROOT_TOPICS,
  'member-changelog': ROOT_TOPICS,
  'project-changelog': ROOT_TOPICS,
  status: [...ROOT_TOPICS, ...RAIL, 'ping', 'map'],
  admin: [...ROOT_TOPICS, 'errors', 'subscribers'],
  messages: [...ROOT_TOPICS, 'messages'],
  blog: ROOT_TOPICS,
  author: ROOT_TOPICS,
  post: [...ROOT_TOPICS, 'reading', 'editing'],
  'blog-new': ROOT_TOPICS,
  'blog-mine': ROOT_TOPICS,
  'post-editor': ROOT_TOPICS,
  editor: ROOT_TOPICS,
  subscribe: ROOT_TOPICS,
  subscription: ROOT_TOPICS,
  search: ROOT_TOPICS,
  privacy: ROOT_TOPICS,
  'sign-in': ROOT_TOPICS,
  kit: ROOT_TOPICS,
  'not-found': ROOT_TOPICS,
} satisfies Record<string, Topic[]>;

export type RouteName = keyof typeof ROUTE_TOPICS;

export interface KeyedMatch {
  loaderData: unknown;
  params: Record<string, string | undefined>;
}

export type Keys = Partial<Record<Topic, (match: KeyedMatch) => string | undefined>>;

export interface LiveHandle {
  topics: Topic[];
  keys?: Keys;
}

export function topicsFor(route: RouteName, keys?: Keys): LiveHandle {
  return keys ? { topics: ROUTE_TOPICS[route], keys } : { topics: ROUTE_TOPICS[route] };
}

export function subscription(handles: LiveHandle[], matches: KeyedMatch[]) {
  const topics = new Set<string>();
  let reading: string | undefined;
  handles.forEach((handle, index) => {
    for (const topic of handle.topics) {
      const keyed = handle.keys?.[topic];
      if (!keyed) {
        topics.add(topic);
        continue;
      }
      const key = keyed(matches[index]);
      if (key) {
        topics.add(`${topic}:${key}`);
        if (topic === 'reading') {
          reading = key;
        }
      }
    }
  });
  return { topics: [...topics].sort(), reading };
}
