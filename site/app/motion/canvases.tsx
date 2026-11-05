import { useEffect, useRef } from 'react';
import { useMotion } from './motion';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  tx: number;
  ty: number;
}

type Point = { x: number; y: number } | null;

const frames = new Set<() => void>();
let handle = 0;
let watching = false;

function tick() {
  handle = 0;
  for (const draw of frames) {
    draw();
  }
  schedule();
}

function schedule() {
  if (!handle && frames.size > 0 && !document.hidden) {
    handle = requestAnimationFrame(tick);
  }
}

export function onFrame(draw: () => void) {
  if (!watching) {
    watching = true;
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        cancelAnimationFrame(handle);
        handle = 0;
      } else {
        schedule();
      }
    });
  }
  frames.add(draw);
  schedule();
  return () => {
    frames.delete(draw);
    if (frames.size === 0) {
      cancelAnimationFrame(handle);
      handle = 0;
    }
  };
}

function scale() {
  return Math.min(devicePixelRatio || 1, 2);
}

function seed(count: number, width: number, height: number, speed: number): Particle[] {
  return Array.from({ length: count }, () => ({
    x: Math.random() * width,
    y: Math.random() * height,
    vx: (Math.random() - 0.5) * speed,
    vy: (Math.random() - 0.5) * speed,
    tx: 0,
    ty: 0,
  }));
}

function drawConstellation(
  context: CanvasRenderingContext2D,
  points: Particle[],
  reach: number,
  dpr: number,
  lineAlpha: number,
  dotAlpha: number,
  glowOf: (point: Particle) => number = () => 1,
  yOf: (point: Particle) => number = (point) => point.y,
) {
  context.lineWidth = dpr;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const ay = yOf(a);
    for (let j = i + 1; j < points.length; j += 1) {
      const b = points[j];
      const by = yOf(b);
      const distance = Math.hypot(a.x - b.x, ay - by);
      if (distance < reach) {
        const glow = (glowOf(a) + glowOf(b)) / 2;
        context.strokeStyle = `rgba(232,232,234,${((1 - distance / reach) * lineAlpha * glow).toFixed(3)})`;
        context.beginPath();
        context.moveTo(a.x, ay);
        context.lineTo(b.x, by);
        context.stroke();
      }
    }
  }
  for (const point of points) {
    context.fillStyle = `rgba(232,232,234,${(dotAlpha * glowOf(point)).toFixed(3)})`;
    context.beginPath();
    context.arc(point.x, yOf(point), 1.3 * dpr, 0, Math.PI * 2);
    context.fill();
  }
}

function trackPointer(
  target: HTMLElement | Window,
  element: HTMLCanvasElement,
  dpr: number,
  set: (point: Point) => void,
) {
  const move = (event: Event) => {
    const { clientX, clientY } = event as PointerEvent;
    const box = element.getBoundingClientRect();
    set({ x: (clientX - box.left) * dpr, y: (clientY - box.top) * dpr });
  };
  const leave = () => set(null);
  target.addEventListener('pointermove', move);
  target.addEventListener('pointerleave', leave);
  return () => {
    target.removeEventListener('pointermove', move);
    target.removeEventListener('pointerleave', leave);
  };
}

export function Field({ density = 7000, reach = 120 }: { density?: number; reach?: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const allowed = useMotion('field');

  useEffect(() => {
    const element = canvas.current;
    const host = element?.parentElement;
    if (!element || !host || !allowed) {
      return;
    }
    const context = element.getContext('2d')!;
    const dpr = scale();
    let width = 0;
    let height = 0;
    let pointer: Point = null;
    let points: Particle[] = [];
    const resize = () => {
      width = element.width = element.clientWidth * dpr;
      height = element.height = element.clientHeight * dpr;
      points = seed(
        Math.max(16, Math.round((element.clientWidth * element.clientHeight) / density)),
        width,
        height,
        0.12 * dpr,
      );
    };
    resize();
    const draw = () => {
      context.clearRect(0, 0, width, height);
      for (const point of points) {
        if (pointer) {
          const dx = pointer.x - point.x;
          const dy = pointer.y - point.y;
          const distance = Math.hypot(dx, dy) || 1;
          if (distance < 160 * dpr) {
            point.vx -= (dx / distance) * 0.004 * dpr;
            point.vy -= (dy / distance) * 0.004 * dpr;
          }
        }
        point.x = (point.x + point.vx + width) % width;
        point.y = (point.y + point.vy + height) % height;
        point.vx *= 0.995;
        point.vy *= 0.995;
      }
      drawConstellation(context, points, reach * dpr, dpr, 0.14, 0.38);
    };
    const untrack = trackPointer(host, element, dpr, (point) => {
      pointer = point;
    });
    addEventListener('resize', resize);
    const stop = onFrame(draw);
    return () => {
      stop();
      untrack();
      removeEventListener('resize', resize);
    };
  }, [allowed, density, reach]);

  return <canvas ref={canvas} className="field" aria-hidden="true" />;
}

export function Backdrop() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const allowed = useMotion('backdrop');

  useEffect(() => {
    const element = canvas.current;
    if (!element || !allowed) {
      return;
    }
    const context = element.getContext('2d')!;
    const dpr = scale();
    let width = 0;
    let height = 0;
    let pointer: Point = null;
    let points: Particle[] = [];
    const resize = () => {
      width = element.width = innerWidth * dpr;
      height = element.height = innerHeight * dpr;
      points = seed(
        Math.min(140, Math.max(24, Math.round((innerWidth * innerHeight) / 13000))),
        width,
        height,
        0.07 * dpr,
      );
    };
    resize();
    const draw = () => {
      context.clearRect(0, 0, width, height);
      const shift = scrollY * 0.15 * dpr;
      const yOf = (point: Particle) => (((point.y - shift) % height) + height) % height;
      const head = document.querySelector('.page-head, .hero')?.getBoundingClientRect();
      const top = (head?.top ?? 0) * dpr;
      const bottom = (head?.bottom ?? 0) * dpr;
      const glowOf = (point: Particle) => {
        const y = yOf(point);
        const away = y < top ? top - y : y > bottom ? y - bottom : 0;
        return Math.max(0.15, 1 - away / (480 * dpr));
      };
      for (const point of points) {
        if (pointer) {
          const dx = pointer.x - point.x;
          const dy = pointer.y - yOf(point);
          const distance = Math.hypot(dx, dy) || 1;
          if (distance < 240 * dpr) {
            const pull = (1 - distance / (240 * dpr)) * 0.0025 * dpr;
            point.vx += (dx / distance) * pull;
            point.vy += (dy / distance) * pull;
          }
        }
        point.x = (point.x + point.vx + width) % width;
        point.y = (point.y + point.vy + height) % height;
        point.vx *= 0.992;
        point.vy *= 0.992;
      }
      drawConstellation(context, points, 110 * dpr, dpr, 0.11, 0.32, glowOf, yOf);
    };
    const untrack = trackPointer(window, element, dpr, (point) => {
      pointer = point;
    });
    addEventListener('resize', resize);
    const stop = onFrame(draw);
    return () => {
      stop();
      untrack();
      removeEventListener('resize', resize);
    };
  }, [allowed]);

  return <canvas ref={canvas} className="backdrop" aria-hidden="true" />;
}

export function Mark({ text }: { text?: string } = {}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const allowed = useMotion('mark');

  useEffect(() => {
    const element = canvas.current;
    if (!element) {
      return;
    }
    const context = element.getContext('2d')!;
    const dpr = scale();
    const size = Math.round(element.clientWidth * dpr);
    element.width = element.height = size;
    const stencil = document.createElement('canvas');
    stencil.width = stencil.height = size;
    const pen = stencil.getContext('2d')!;
    pen.strokeStyle = '#fff';
    pen.fillStyle = '#fff';
    if (text) {
      pen.font = `700 ${Math.round(size * 0.46)}px ${getComputedStyle(element).fontFamily}`;
      pen.textAlign = 'center';
      pen.textBaseline = 'middle';
      pen.fillText(text, size / 2, size / 2, size * 0.9);
    } else {
      const unit = (size * 0.78) / 46;
      pen.setTransform(
        unit,
        0,
        0,
        unit,
        (size - 36 * unit) / 2 + 3 * unit,
        (size - 46 * unit) / 2 + 3 * unit,
      );
      pen.lineWidth = 6;
      pen.lineCap = 'round';
      pen.lineJoin = 'round';
      pen.beginPath();
      pen.moveTo(5.62, 25);
      pen.lineTo(0, 40);
      pen.moveTo(24.38, 25);
      pen.lineTo(30, 40);
      pen.stroke();
      pen.beginPath();
      pen.moveTo(15, 0);
      pen.lineTo(8.25, 18);
      pen.lineTo(21.75, 18);
      pen.closePath();
      pen.fill();
      pen.stroke();
    }
    const pixels = pen.getImageData(0, 0, size, size).data;
    const step = Math.max(3, Math.round(2.8 * dpr));
    const points: Particle[] = [];
    for (let y = 0; y < size; y += step) {
      for (let x = 0; x < size; x += step) {
        if (pixels[(y * size + x) * 4 + 3] > 128) {
          points.push({
            x: allowed ? Math.random() * size : x,
            y: allowed ? Math.random() * size : y,
            tx: x,
            ty: y,
            vx: 0,
            vy: 0,
          });
        }
      }
    }
    let pointer: Point = null;
    const draw = () => {
      context.clearRect(0, 0, size, size);
      context.fillStyle = '#e8e8ea';
      for (const point of points) {
        if (allowed) {
          point.vx += (point.tx - point.x) * 0.05;
          point.vy += (point.ty - point.y) * 0.05;
          if (pointer) {
            const dx = point.x - pointer.x;
            const dy = point.y - pointer.y;
            const distance = Math.hypot(dx, dy) || 1;
            if (distance < 70 * dpr) {
              const push = ((70 * dpr - distance) / (70 * dpr)) * 3.5 * dpr;
              point.vx += (dx / distance) * push;
              point.vy += (dy / distance) * push;
            }
          }
          point.vx *= 0.78;
          point.vy *= 0.78;
          point.x += point.vx;
          point.y += point.vy;
        }
        context.fillRect(point.x, point.y, 1.6 * dpr, 1.6 * dpr);
      }
    };
    if (!allowed) {
      draw();
      return;
    }
    const untrack = trackPointer(element, element, dpr, (point) => {
      pointer = point;
    });
    const stop = onFrame(draw);
    return () => {
      stop();
      untrack();
    };
  }, [allowed, text]);

  return <canvas ref={canvas} aria-hidden="true" />;
}
