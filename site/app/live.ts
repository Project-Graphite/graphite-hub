import { useEffect, useEffectEvent, useSyncExternalStore } from 'react';
import { useMatches, useRevalidator } from 'react-router';
import { revalidates, subscription, type LiveHandle } from './topics';
import type { ConsoleLine, Presence } from './types';

const COALESCE_MS = 100;

export interface LiveMessage {
  id: string;
  topic: string;
  key?: string;
  kind: string;
  console: Omit<ConsoleLine, 'id'> | null;
  data?: Record<string, unknown>;
}

export interface Editor {
  handle: string;
  name: string;
  color: string;
}

function createStore<T>(initial: T) {
  let value = initial;
  const subscribers = new Set<() => void>();
  return {
    get: () => value,
    initial: () => initial,
    set(next: T) {
      value = next;
      subscribers.forEach((notify) => notify());
    },
    subscribe(notify: () => void) {
      subscribers.add(notify);
      return () => {
        subscribers.delete(notify);
      };
    },
  };
}

const connection = createStore<'live' | 'reconnecting'>('live');
const presence = createStore<Presence | null>(null);
const reading = createStore(new Map<string, number>());
const editing = createStore(new Map<string, Editor[]>());
const views = createStore(new Map<string, number>());

function useStore<T>(store: ReturnType<typeof createStore<T>>) {
  return useSyncExternalStore(store.subscribe, store.get, store.initial);
}

export function useConnection() {
  return useStore(connection);
}

export function usePresence(initial: Presence) {
  return useStore(presence) ?? initial;
}

export function useOnline() {
  return new Set(useStore(presence)?.online ?? []);
}

export function useReading(key: string, initial: number) {
  return useStore(reading).get(key) ?? initial;
}

export function useEditing(key: string, initial: Editor[]) {
  return useStore(editing).get(key) ?? initial;
}

export function useViews(totals: Record<string, number>) {
  const live = useStore(views);
  return (kind: 'post' | 'project', key: string) =>
    live.get(`${kind}:${key}`) ?? totals[`${kind}:${key}`] ?? 0;
}

function patch(message: LiveMessage) {
  const data = message.data ?? {};
  switch (message.topic) {
    case 'presence':
      presence.set(data as unknown as Presence);
      break;
    case 'reading':
      if (message.key) {
        reading.set(new Map(reading.get()).set(message.key, Number(data.reading)));
      }
      break;
    case 'editing':
      if (message.key) {
        editing.set(new Map(editing.get()).set(message.key, data.editors as Editor[]));
      }
      break;
    case 'views':
      views.set(new Map(views.get()).set(`${data.kind}:${data.key}`, Number(data.total)));
      break;
  }
}

const VIEW_AFTER_MS = 10_000;
const VIEW_SCROLL = 0.25;

export function useView(kind: 'post' | 'project', key: string) {
  useEffect(() => {
    let sent = false;
    let scrolled = false;
    let visibleFor = 0;
    let since = document.visibilityState === 'visible' ? performance.now() : null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const elapsed = () => visibleFor + (since === null ? 0 : performance.now() - since);
    const check = () => {
      clearTimeout(timer);
      timer = undefined;
      if (sent) {
        return;
      }
      if (elapsed() >= VIEW_AFTER_MS && scrolled) {
        sent = true;
        void fetch(`/views/${kind}/${key}`, { method: 'POST', keepalive: true });
      } else if (since !== null) {
        timer = setTimeout(check, Math.max(50, VIEW_AFTER_MS - elapsed()));
      }
    };
    const onScroll = () => {
      if (!scrolled) {
        scrolled = (scrollY + innerHeight) / document.documentElement.scrollHeight >= VIEW_SCROLL;
        check();
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        since = performance.now();
      } else if (since !== null) {
        visibleFor += performance.now() - since;
        since = null;
      }
      check();
    };
    addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);
    onScroll();
    check();
    return () => {
      clearTimeout(timer);
      removeEventListener('scroll', onScroll);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [kind, key]);
}

const listeners = new Set<(message: LiveMessage) => void>();

export function useLiveMessages(listener: (message: LiveMessage) => void) {
  const onMessage = useEffectEvent(listener);
  useEffect(() => {
    const forward = (message: LiveMessage) => onMessage(message);
    listeners.add(forward);
    return () => {
      listeners.delete(forward);
    };
  }, []);
}

export function useLive() {
  const matches = useMatches();
  const live = subscription(
    matches.map((match) => (match.handle as LiveHandle | undefined) ?? { topics: [] }),
    matches,
  );
  const topics = live.topics.join(',');
  const { revalidate } = useRevalidator();
  const refresh = useEffectEvent(() => revalidate());

  useEffect(() => {
    if (!topics) {
      return;
    }
    reading.set(new Map());
    editing.set(new Map());
    const query = new URLSearchParams({ topics });
    if (live.reading) {
      query.set('reading', live.reading);
    }
    const source = new EventSource(`/live?${query}`);
    let timer: ReturnType<typeof setTimeout> | undefined;
    let dropped = false;
    source.onopen = () => {
      connection.set('live');
      if (dropped) {
        dropped = false;
        refresh();
      }
    };
    source.onerror = () => {
      dropped = true;
      connection.set('reconnecting');
    };
    source.onmessage = (event: MessageEvent<string>) => {
      const message = { ...JSON.parse(event.data), id: event.lastEventId } as LiveMessage;
      patch(message);
      for (const listener of listeners) {
        listener(message);
      }
      if (revalidates(message.topic)) {
        clearTimeout(timer);
        timer = setTimeout(refresh, COALESCE_MS);
      }
    };
    return () => {
      clearTimeout(timer);
      source.close();
      connection.set('live');
    };
  }, [topics, live.reading]);
}
