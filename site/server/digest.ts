import { WEEKDAYS } from '../app/settings.ts';
import { parseScope, scopeMatches } from '../app/subscribe.ts';

const DAY_MS = 86_400_000;

export function nextDigestAt(now: number, day: string, hourUtc: number) {
  const wanted = (WEEKDAYS.indexOf(day as (typeof WEEKDAYS)[number]) + 1) % 7;
  const next = new Date(now);
  next.setUTCHours(hourUtc, 0, 0, 0);
  while (next.getUTCDay() !== wanted || next.getTime() <= now) {
    next.setTime(next.getTime() + DAY_MS);
  }
  return next.toISOString();
}

export function digestFor<P extends { author: string; project: string | null }>(
  scope: string,
  posts: P[],
) {
  const parsed = parseScope(scope);
  return parsed ? posts.filter((post) => scopeMatches(parsed, post)) : [];
}

export function spreadDue(now: number, index: number, perHour: number) {
  return new Date(now + Math.round((index * 3_600_000) / perHour)).toISOString();
}
