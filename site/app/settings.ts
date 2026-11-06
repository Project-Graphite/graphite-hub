export type Area = 'site' | 'home' | 'rail' | 'blog' | 'email';

interface Base<Kind extends string, T> {
  kind: Kind;
  area: Area;
  label: string;
  default: T;
}

export type TextSetting = Base<'text', string> & {
  max: number;
  multiline: boolean;
  optional: boolean;
};
export type NumberSetting = Base<'number', number> & { min: number; max: number };
export type OrderItem = { id: string; on: boolean };
export type OrderSetting = Base<'order', OrderItem[]> & { options: readonly string[] };
export type SetSetting = Base<'set', string[]> & { options: readonly string[] };
export type ColorsSetting = Base<'colors', string[]>;
export type ChoiceSetting = Base<'choice', string> & { options: readonly string[] };
export type Setting =
  TextSetting | NumberSetting | OrderSetting | SetSetting | ColorsSetting | ChoiceSetting;

const text = (
  area: Area,
  label: string,
  value: string,
  max = 120,
  multiline = false,
  optional = false,
): TextSetting => ({
  kind: 'text',
  area,
  label,
  default: value,
  max,
  multiline,
  optional,
});
const number = (
  area: Area,
  label: string,
  value: number,
  min: number,
  max: number,
): NumberSetting => ({
  kind: 'number',
  area,
  label,
  default: value,
  min,
  max,
});
const order = (
  area: Area,
  label: string,
  options: readonly string[],
  hidden: string[] = [],
): OrderSetting => ({
  kind: 'order',
  area,
  label,
  options,
  default: options.map((id) => ({ id, on: !hidden.includes(id) })),
});
const set = (
  area: Area,
  label: string,
  options: readonly string[],
  value = [...options],
): SetSetting => ({
  kind: 'set',
  area,
  label,
  options,
  default: value,
});
const colors = (area: Area, label: string, value: string[]): ColorsSetting => ({
  kind: 'colors',
  area,
  label,
  default: value,
});
const choice = (
  area: Area,
  label: string,
  options: readonly string[],
  value: string,
): ChoiceSetting => ({
  kind: 'choice',
  area,
  label,
  options,
  default: value,
});

export const HOME_SECTIONS = [
  'hero',
  'ticker',
  'timeline',
  'featured',
  'members',
  'writing',
  'more',
] as const;
export const RAIL_PANELS = ['members', 'messages', 'console', 'changelog', 'running'] as const;
export const COUNTERS = ['members', 'projects', 'live', 'releases', 'deploys'] as const;
export const NAV = [
  'members',
  'epics',
  'projects',
  'blog',
  'changelog',
  'messages',
  'status',
  'github',
] as const;
export const MOTION = [
  'backdrop',
  'field',
  'mark',
  'tilt',
  'spotlight',
  'magnetic',
  'counters',
  'ticker',
  'orbit',
] as const;
export const EVENT_KINDS = ['deploy', 'release', 'post', 'sync', 'uptime'] as const;
export const WEEKDAYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const;

export const SETTINGS = {
  'site.name': text('site', 'Site name', 'Project Graphite', 40),
  'site.footer': text(
    'site',
    'Footer line',
    'Project Graphite · Made for Learning · Made for Fun · Made for Everyone',
  ),
  'site.nav': order('site', 'Navigation', NAV, ['status']),
  'site.motion': set('site', 'Motion pieces', MOTION),
  'site.accents': colors('site', 'Accent set', [
    '#6f8fd1',
    '#c9a15f',
    '#8fb86a',
    '#a98fd6',
    '#d47a86',
    '#5fb3b3',
    '#d08a52',
    '#9aa7b8',
  ]),
  'home.sections': order('home', 'Sections', HOME_SECTIONS),
  'home.hero.eyebrow': text('home', 'Hero eyebrow', 'members / epics / projects', 60),
  'home.hero.headline': text(
    'home',
    'Hero headline',
    'Software built in the open by the members of Project Graphite.',
    90,
  ),
  'home.hero.paragraph': text(
    'home',
    'Hero paragraph',
    'Every project has its own repository and its own subdomain. Deployed work runs on one shared host; source-only work is labelled as such.',
    320,
    true,
  ),
  'home.hero.primary': text('home', 'Primary action', 'explore projects', 30),
  'home.counters': order('home', 'Counters', COUNTERS),
  'home.ticker.kinds': set('home', 'Activity line kinds', EVENT_KINDS, [
    'deploy',
    'release',
    'post',
    'sync',
  ]),
  'home.ticker.count': number('home', 'Activity line length', 8, 1, 20),
  'home.timeline.days': number('home', 'Release window, days', 60, 14, 365),
  'home.featured.title': text('home', 'Featured heading', 'Featured projects', 60),
  'home.featured.description': text('home', 'Featured description', '', 200, true, true),
  'home.featured.count': number('home', 'Featured projects', 3, 1, 6),
  'home.members.title': text('home', 'Members heading', 'Meet the members', 60),
  'home.members.description': text('home', 'Members description', '', 200, true, true),
  'home.writing.title': text('home', 'Writing heading', 'Latest writing', 60),
  'home.writing.count': number('home', 'Posts on the filmstrip', 7, 3, 12),
  'home.more.title': text('home', 'More projects heading', 'More projects', 60),
  'home.more.count': number('home', 'More projects', 6, 0, 12),
  'home.rail': order('rail', 'Home rail panels', RAIL_PANELS, ['running']),
  'rail.changelog.count': number('rail', 'Changelog entries in the rail', 2, 1, 8),
  'rail.console.lines': number('rail', 'Console lines', 12, 4, 30),
  'blog.title': text('blog', 'Blog heading', 'Writing', 60),
  'blog.intro': text(
    'blog',
    'Blog introduction',
    'Notes, releases and lessons from the members, as they happen.',
    240,
    true,
    true,
  ),
  'blog.filmstrip.count': number('blog', 'Posts on the filmstrip', 6, 3, 12),
  'blog.page.count': number('blog', 'Posts shown before "more"', 12, 6, 48),
  'blog.project.title': text('blog', 'Writing about a project heading', 'writing about it', 60),
  'messages.intro': text(
    'site',
    'Messages introduction',
    'Leave a message for the members. Public messages go straight on the wall; private ones are only for us.',
    300,
    true,
  ),
  'subscribe.intro': text(
    'blog',
    'Subscribe introduction',
    'New writing lands in your inbox as it publishes, or once a week in one email. Nothing else, ever.',
    240,
    true,
  ),
  'email.from.name': text('email', 'Sender name', 'Project Graphite', 60),
  'email.reply_to': text('email', 'Reply-to address', '', 120, false, true),
  'email.hourly': number('email', 'Emails an hour', 20, 5, 100),
  'email.digest.day': choice('email', 'Digest day', WEEKDAYS, 'monday'),
  'email.digest.hour': number('email', 'Digest hour, UTC', 8, 0, 23),
  'email.confirm.subject': text(
    'email',
    'Confirmation subject · {{site}} {{what}}',
    'Confirm your subscription to {{site}}',
    120,
  ),
  'email.confirm.body': text(
    'email',
    'Confirmation intro · {{site}} {{what}}',
    'One click and you will get {{what}} from {{site}}. If this was not you, ignore this email and nothing happens.',
    400,
    true,
  ),
  'email.post.subject': text(
    'email',
    'New post subject · {{title}} {{author}} {{site}}',
    '{{author}} published: {{title}}',
    120,
  ),
  'email.post.body': text(
    'email',
    'New post intro · {{title}} {{author}} {{about}} {{site}}',
    '{{author}} just published a new post{{about}}.',
    400,
    true,
  ),
  'email.digest.subject': text(
    'email',
    'Digest subject · {{count}} {{posts}} {{site}}',
    'This week on {{site}}: {{count}} new {{posts}}',
    120,
  ),
  'email.digest.body': text(
    'email',
    'Digest intro · {{count}} {{posts}} {{site}}',
    'What the members wrote this week, in one place.',
    400,
    true,
  ),
  'email.footer': text(
    'email',
    'Email footer · {{site}} {{what}}',
    'You get this because you subscribed to {{what}} at {{site}}.',
    200,
    true,
  ),
} satisfies Record<string, Setting>;

export type SettingKey = keyof typeof SETTINGS;
export type Values = { [K in SettingKey]: (typeof SETTINGS)[K]['default'] };

const HEX = /^#[0-9a-f]{6}$/i;

export function isSettingKey(key: string): key is SettingKey {
  return Object.hasOwn(SETTINGS, key);
}

export function problem(key: SettingKey, value: unknown): string | null {
  const setting: Setting = SETTINGS[key];
  switch (setting.kind) {
    case 'text':
      return typeof value === 'string' &&
        (setting.optional || value.trim().length > 0) &&
        value.length <= setting.max
        ? null
        : `${setting.label} must be ${setting.optional ? 'at most' : '1 to'} ${setting.max} characters.`;
    case 'number':
      return Number.isInteger(value) &&
        (value as number) >= setting.min &&
        (value as number) <= setting.max
        ? null
        : `${setting.label} must be a whole number from ${setting.min} to ${setting.max}.`;
    case 'order': {
      const items = value as OrderItem[];
      const ids = Array.isArray(items) ? items.map((item) => item?.id) : [];
      return Array.isArray(items) &&
        items.every((item) => typeof item?.on === 'boolean') &&
        ids.length === setting.options.length &&
        setting.options.every((option) => ids.includes(option))
        ? null
        : `${setting.label} must list each of ${setting.options.join(', ')} once.`;
    }
    case 'set':
      return Array.isArray(value) &&
        new Set(value).size === value.length &&
        value.every((item) => setting.options.includes(item))
        ? null
        : `${setting.label} may only contain ${setting.options.join(', ')}.`;
    case 'colors':
      return Array.isArray(value) &&
        value.length >= 3 &&
        value.length <= 16 &&
        value.every((item) => HEX.test(item))
        ? null
        : `${setting.label} must be 3 to 16 colours like #6f8fd1.`;
    case 'choice':
      return typeof value === 'string' && setting.options.includes(value)
        ? null
        : `${setting.label} must be one of ${setting.options.join(', ')}.`;
  }
}

export function defaults(): Values {
  return Object.fromEntries(
    Object.entries(SETTINGS).map(([key, setting]) => [key, structuredClone(setting.default)]),
  ) as Values;
}

export function visible(items: OrderItem[]) {
  return items.filter((item) => item.on).map((item) => item.id);
}
