import { useEffect, useEffectEvent } from 'react';
import { useMatches, useRevalidator } from 'react-router';

const COALESCE_MS = 100;

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
    source.onmessage = () => {
      clearTimeout(timer);
      timer = setTimeout(refresh, COALESCE_MS);
    };
    return () => {
      clearTimeout(timer);
      source.close();
    };
  }, [topics]);
}
