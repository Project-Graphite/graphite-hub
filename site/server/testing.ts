import type { Bus, HubEvent } from './bus.ts';
import { openDatabase } from './db.ts';

export function memoryDatabase() {
  return openDatabase(':memory:');
}

export function recordingBus() {
  const recorded: HubEvent[] = [];
  const published: HubEvent[] = [];
  const listeners = new Set<(delivery: { event: HubEvent }) => void>();
  const bus = {
    ready: Promise.resolve(),
    record: async (event: HubEvent) => {
      recorded.push(event);
      return `${Date.now()}-${recorded.length}`;
    },
    publish: async (event: HubEvent) => {
      published.push(event);
      for (const listener of listeners) {
        listener({ event });
      }
    },
    since: async () => [],
    listen: (listener: (delivery: { event: HubEvent }) => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  } as unknown as Bus;
  return { bus, recorded, published };
}
