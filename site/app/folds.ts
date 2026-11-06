import { useSyncExternalStore } from 'react';

const KEY = 'graphite.folded';
const listeners = new Set<() => void>();
let folded: Record<string, boolean> | undefined;

function read() {
  if (!folded) {
    try {
      folded = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, boolean>;
    } catch {
      folded = {};
    }
  }
  return folded;
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

export function useFolded(id: string): [boolean, () => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => read()[id] === true,
    () => false,
  );
  const toggle = () => {
    const next = { ...read(), [id]: !read()[id] };
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
      folded = undefined;
    } catch {
      folded = next;
    }
    for (const listener of listeners) {
      listener();
    }
  };
  return [value, toggle];
}
