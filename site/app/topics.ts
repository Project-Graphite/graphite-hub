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
export const ROOT_TOPICS: Topic[] = ['settings', 'presence'];
const PAGE: Topic[] = [...DIRECTORY, 'presence', 'views'];
const RAIL: Topic[] = ['deploys', 'uptime'];

export function changesRoot(topic: string) {
  return topic === 'sessions' || DIRECTORY.includes(topic as Topic);
}

export function followsDirectory(topics: string[]) {
  return DIRECTORY.every((topic) => topics.includes(topic));
}

export const ROUTE_TOPICS = {
  home: [...PAGE, ...RAIL, 'stats', 'messages'],
  members: [...PAGE, ...RAIL],
  member: [...PAGE, ...RAIL],
  epics: [...PAGE, ...RAIL],
  projects: [...PAGE, ...RAIL],
  resolved: [...PAGE, ...RAIL, 'reading'],
  changelog: PAGE,
  'member-changelog': PAGE,
  'project-changelog': PAGE,
  status: [...PAGE, ...RAIL, 'ping', 'map'],
  admin: [...PAGE, 'errors', 'subscribers'],
  messages: [...PAGE, 'messages'],
  blog: PAGE,
  author: PAGE,
  post: [...PAGE, 'reading', 'editing'],
  'blog-new': PAGE,
  'blog-mine': PAGE,
  'post-editor': PAGE,
  editor: PAGE,
  subscribe: PAGE,
  subscription: PAGE,
  search: PAGE,
  privacy: ROOT_TOPICS,
  kit: PAGE,
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
