import { useEffect, useEffectEvent } from 'react';
import { useMatches, useRevalidator } from 'react-router';
import type { ConsoleLine } from './types';

const COALESCE_MS = 100;

export interface LiveMessage {
  id: string;
  topic: string;
  key?: string;
  kind: string;
  console: Omit<ConsoleLine, 'id'> | null;
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
  const topics = [
    ...new Set(
      useMatches().flatMap(
        (match) => (match.handle as { topics?: string[] } | undefined)?.topics ?? [],
      ),
    ),
  ]
    .sort()
    .join(',');
  const { revalidate } = useRevalidator();
  const refresh = useEffectEvent(() => revalidate());

  useEffect(() => {
    if (!topics) {
      return;
    }
    const source = new EventSource(`/live?topics=${encodeURIComponent(topics)}`);
    let timer: ReturnType<typeof setTimeout> | undefined;
    source.onmessage = (event: MessageEvent<string>) => {
      const message = { ...JSON.parse(event.data), id: event.lastEventId } as LiveMessage;
      for (const listener of listeners) {
        listener(message);
      }
      clearTimeout(timer);
      timer = setTimeout(refresh, COALESCE_MS);
    };
    return () => {
      clearTimeout(timer);
      source.close();
    };
  }, [topics]);
}
