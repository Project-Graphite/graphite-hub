const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function clock(iso: string) {
  return iso.slice(11, 16);
}

export function day(iso: string) {
  const date = new Date(iso);
  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}`;
}

export function shortTag(tag: unknown) {
  return typeof tag === 'string' ? tag.replace(/^sha-/, '').slice(0, 7) : '';
}

export const KIND_LABEL: Record<string, string> = {
  deploy: 'deployed',
  release: 'released',
  post: 'published',
  sync: 'synced',
  uptime: 'uptime',
};

export function describe(detail: Record<string, unknown>) {
  const parts: string[] = [];
  if (typeof detail.tag === 'string') {
    parts.push(`sha-${shortTag(detail.tag)}`);
  }
  if (typeof detail.durationMs === 'number') {
    parts.push(`${Math.round(detail.durationMs / 1000)} s`);
  }
  if (typeof detail.healthStatus === 'number') {
    parts.push(
      `health ${detail.healthStatus}${typeof detail.healthMs === 'number' ? ` in ${detail.healthMs} ms` : ''}`,
    );
  }
  if (detail.counts && typeof detail.counts === 'object') {
    parts.push(
      ...Object.entries(detail.counts as Record<string, number>).map(
        ([type, count]) => `${count} ${type}`,
      ),
    );
  }
  if (typeof detail.up === 'number' && typeof detail.total === 'number') {
    parts.push(`${detail.up} of ${detail.total} up`);
  }
  if (typeof detail.p95Ms === 'number') {
    parts.push(`p95 ${detail.p95Ms} ms`);
  }
  for (const key of ['added', 'changed', 'removed'] as const) {
    if (Array.isArray(detail[key]) && (detail[key] as string[]).length > 0) {
      parts.push(`${key} ${(detail[key] as string[]).join(', ')}`);
    }
  }
  return parts.join(' · ');
}
