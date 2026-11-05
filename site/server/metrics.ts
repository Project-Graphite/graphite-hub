import { percentile } from './uptime.ts';

const WINDOW_MINUTES = 5;

export function createMetrics(now = () => Date.now()) {
  const minutes = new Map<number, { requests: number; errors: number; durations: number[] }>();

  function prune(current: number) {
    for (const minute of minutes.keys()) {
      if (minute <= current - WINDOW_MINUTES) {
        minutes.delete(minute);
      }
    }
  }

  return {
    observe(status: number, ms: number) {
      const minute = Math.floor(now() / 60_000);
      prune(minute);
      const bucket = minutes.get(minute) ?? { requests: 0, errors: 0, durations: [] };
      bucket.requests += 1;
      bucket.errors += status >= 500 ? 1 : 0;
      bucket.durations.push(ms);
      minutes.set(minute, bucket);
    },
    snapshot(liveConnections: number) {
      prune(Math.floor(now() / 60_000));
      const buckets = [...minutes.values()];
      const requests = buckets.reduce((sum, bucket) => sum + bucket.requests, 0);
      const errors = buckets.reduce((sum, bucket) => sum + bucket.errors, 0);
      return {
        windowMinutes: WINDOW_MINUTES,
        requests,
        errorRate: requests === 0 ? 0 : errors / requests,
        p95Ms: percentile(
          buckets.flatMap((bucket) => bucket.durations),
          0.95,
        ),
        liveConnections,
      };
    },
  };
}
