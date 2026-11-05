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

export function useMotion(piece: MotionPiece) {
  const enabled = useContext(MotionContext).includes(piece);
  const reduce = useSyncExternalStore(
    subscribe,
    () => matchMedia(REDUCED).matches,
    () => true,
  );
  return enabled && !reduce;
}

function usePointer<T extends HTMLElement>(
  piece: MotionPiece,
  onMove: (element: T, event: PointerEvent) => void,
  onLeave: (element: T) => void,
) {
  const allowed = useMotion(piece);
  const cleanup = useRef<() => void>(undefined);
  return useCallback(
    (element: T | null) => {
      cleanup.current?.();
      cleanup.current = undefined;
      if (!element || !allowed) {
        return;
      }
      const move = (event: PointerEvent) => onMove(element, event);
      const leave = () => onLeave(element);
      element.addEventListener('pointermove', move);
      element.addEventListener('pointerleave', leave);
      cleanup.current = () => {
        element.removeEventListener('pointermove', move);
        element.removeEventListener('pointerleave', leave);
        leave();
      };
    },
    [allowed, onMove, onLeave],
  );
}

const tiltMove = (element: HTMLElement, event: PointerEvent) => {
  const box = element.getBoundingClientRect();
  const x = (event.clientX - box.left) / box.width - 0.5;
  const y = (event.clientY - box.top) / box.height - 0.5;
  element.style.transform = `perspective(900px) rotateX(${(-y * 4).toFixed(2)}deg) rotateY(${(x * 4).toFixed(2)}deg) translateY(-2px)`;
};
const magneticMove = (element: HTMLElement, event: PointerEvent) => {
  const box = element.getBoundingClientRect();
  element.style.transform = `translate(${((event.clientX - box.left - box.width / 2) * 0.18).toFixed(1)}px, ${((event.clientY - box.top - box.height / 2) * 0.25).toFixed(1)}px)`;
};
const clearTransform = (element: HTMLElement) => {
  element.style.transform = '';
};
const spotMove = (element: HTMLElement, event: PointerEvent) => {
  const box = element.getBoundingClientRect();
  element.style.setProperty('--mx', `${event.clientX - box.left}px`);
  element.style.setProperty('--my', `${event.clientY - box.top}px`);
};
const keepSpot = () => {};

export const useTilt = <T extends HTMLElement>() => usePointer<T>('tilt', tiltMove, clearTransform);
export const useMagnetic = <T extends HTMLElement>() =>
  usePointer<T>('magnetic', magneticMove, clearTransform);
export const useSpotlight = <T extends HTMLElement>() =>
  usePointer<T>('spotlight', spotMove, keepSpot);

export function useCountUp(target: number) {
  const allowed = useMotion('counters');
  const [shown, setShown] = useState(target);
  const from = useRef(0);
  useEffect(() => {
    if (!allowed) {
      return;
    }
    const start = from.current;
    const began = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const progress = Math.min(1, (now - began) / 1000);
      setShown(Math.round(start + (target - start) * (1 - (1 - progress) ** 3)));
      if (progress < 1) {
        frame = requestAnimationFrame(step);
      } else {
        from.current = target;
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
