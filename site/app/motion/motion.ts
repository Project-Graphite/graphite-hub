import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import type { MOTION } from '../settings';

export type MotionPiece = (typeof MOTION)[number];

export const MotionContext = createContext<readonly string[]>([]);

const REDUCED = '(prefers-reduced-motion: reduce)';

function subscribe(onChange: () => void) {
  const query = matchMedia(REDUCED);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

export function useReducedMotion() {
  return useSyncExternalStore(
    subscribe,
    () => matchMedia(REDUCED).matches,
    () => true,
  );
}

export function useMotion(piece: MotionPiece) {
  const reduce = useReducedMotion();
  return useContext(MotionContext).includes(piece) && !reduce;
}

export function useSpotlight<T extends HTMLElement>() {
  const allowed = useMotion('spotlight');
  const cleanup = useRef<() => void>(undefined);
  return useCallback(
    (element: T | null) => {
      cleanup.current?.();
      cleanup.current = undefined;
      if (!element || !allowed) {
        return;
      }
      const move = (event: PointerEvent) => {
        const box = element.getBoundingClientRect();
        element.style.setProperty('--mx', `${event.clientX - box.left}px`);
        element.style.setProperty('--my', `${event.clientY - box.top}px`);
      };
      element.addEventListener('pointermove', move);
      cleanup.current = () => element.removeEventListener('pointermove', move);
    },
    [allowed],
  );
}

export function useCountUp(target: number) {
  const allowed = useMotion('counters');
  const [shown, setShown] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    const start = from.current;
    if (!allowed || start === target) {
      from.current = target;
      return;
    }
    const began = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const progress = Math.min(1, (now - began) / 1000);
      from.current = Math.round(start + (target - start) * (1 - (1 - progress) ** 3));
      setShown(from.current);
      if (progress < 1) {
        frame = requestAnimationFrame(step);
      }
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [allowed, target]);
  return allowed ? shown : target;
}

export function useCycle(count: number, every: number) {
  const allowed = useMotion('ticker');
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (!allowed || count < 2) {
      return;
    }
    const timer = setInterval(() => setIndex((current) => (current + 1) % count), every);
    return () => clearInterval(timer);
  }, [allowed, count, every]);
  return count === 0 ? 0 : index % count;
}
