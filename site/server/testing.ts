import type { Bus, HubEvent } from './bus.ts';
import { openDatabase } from './db.ts';

export function memoryDatabase() {
  return openDatabase(':memory:');
}

export function recordingBus() {
  const recorded: HubEvent[] = [];
  const published: HubEvent[] = [];
  const bus = {
    ready: Promise.resolve(),
    record: async (event: HubEvent) => {
      recorded.push(event);
      return `${Date.now()}-${recorded.length}`;
    },
    publish: async (event: HubEvent) => {
      published.push(event);
    },
    since: async () => [],
    listen: () => () => true,
  } as unknown as Bus;
  return { bus, recorded, published };
}
