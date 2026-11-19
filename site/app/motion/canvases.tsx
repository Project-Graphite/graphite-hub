import { useContext, useEffect, useRef } from 'react';
import { useLiveMessages } from '../live';
import { MotionContext, useMotion, useReducedMotion } from './motion';

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

interface Star {
  x: number;
  y: number;
  heading: number;
  speed: number;
  phase: number;
  period: number;
  size: number;
  dx: number;
  dy: number;
}

const INK = '232, 232, 234';
const TURN = Math.PI * 2;
const REACH = 120;
const EDGE = REACH / 2;
const LEVELS = 4;
const LINE_ALPHA = 0.1;
const DOT_ALPHA = 0.3;
const FRAME_MS = 1000 / 30;
const NUDGE_REACH = 200;
const NUDGE = 12;
const FLARE_MS = 1200;
const FLARE_GAP_MS = 1000;
const FORWARD_CELLS = [
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
] as const;

function createSky(element: HTMLCanvasElement) {
  const context = element.getContext('2d')!;
  const stars: Star[] = [];
  const lines: number[][] = Array.from({ length: LEVELS }, () => []);
  const dots: number[][] = Array.from({ length: LEVELS }, () => []);
  let cells: number[][] = [];
  let columns = 0;
  let rows = 0;
  let width = 0;
  let height = 0;
  let pointer: Point = null;
  let flared = -1;
  let flaredAt = -FLARE_GAP_MS;

  const link = (a: Star, b: Star) => {
    const distance = Math.hypot(a.x + a.dx - b.x - b.dx, a.y + a.dy - b.y - b.dy);
    if (distance < REACH) {
      lines[Math.min(LEVELS - 1, Math.floor((1 - distance / REACH) * LEVELS))].push(
        a.x + a.dx,
        a.y + a.dy,
        b.x + b.dx,
        b.y + b.dy,
      );
    }
  };

  return {
    resize() {
      const dpr = Math.min(devicePixelRatio || 1, 1.5);
      width = element.clientWidth;
      height = element.clientHeight;
      element.width = Math.round(width * dpr);
      element.height = Math.round(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      const spanX = width + EDGE * 2;
      const spanY = height + EDGE * 2;
      const count = Math.min(110, Math.max(40, Math.round((spanX * spanY) / 16000)));
      const down = Math.max(1, Math.round(Math.sqrt((count * spanY) / spanX)));
      const across = Math.ceil(count / down);
      stars.length = Math.min(stars.length, count);
      while (stars.length < count) {
        const cell = Math.floor((stars.length * across * down) / count);
        stars.push({
          x: ((cell % across) + Math.random()) * (spanX / across) - EDGE,
          y: (Math.floor(cell / across) + Math.random()) * (spanY / down) - EDGE,
          heading: Math.random() * TURN,
          speed: 4 + Math.random() * 6,
          phase: Math.random() * TURN,
          period: 4 + Math.random() * 5,
          size: 0.9 + Math.random() * 0.7,
          dx: 0,
          dy: 0,
        });
      }
      columns = Math.ceil((width + EDGE * 2) / REACH) + 1;
      rows = Math.ceil((height + EDGE * 2) / REACH) + 1;
      cells = Array.from({ length: columns * rows }, () => []);
    },

    point(next: Point) {
      pointer = next;
    },

    flare(now: number) {
      if (now - flaredAt < FLARE_GAP_MS) {
        return;
      }
      const inView = stars.flatMap((star, index) =>
        star.x > width * 0.1 &&
        star.x < width * 0.9 &&
        star.y > height * 0.1 &&
        star.y < height * 0.9
          ? [index]
          : [],
      );
      if (inView.length > 0) {
        flared = inView[Math.floor(Math.random() * inView.length)];
        flaredAt = now;
      }
    },

    draw(now: number, elapsed: number) {
      const seconds = now / 1000;
      const ease = Math.min(1, elapsed * 6);
      for (const group of [cells, lines, dots]) {
        for (const list of group) {
          list.length = 0;
        }
      }
      stars.forEach((star, index) => {
        const bearing =
          star.heading +
          0.7 * Math.sin(star.x * 0.004 + seconds * 0.16) +
          0.7 * Math.cos(star.y * 0.005 - seconds * 0.13);
        star.x += Math.cos(bearing) * star.speed * elapsed;
        star.y += Math.sin(bearing) * star.speed * elapsed;
        if (star.x < -EDGE) {
          star.x += width + EDGE * 2;
        } else if (star.x > width + EDGE) {
          star.x -= width + EDGE * 2;
        }
        if (star.y < -EDGE) {
          star.y += height + EDGE * 2;
        } else if (star.y > height + EDGE) {
          star.y -= height + EDGE * 2;
        }
        let pushX = 0;
        let pushY = 0;
        if (pointer) {
          const awayX = star.x - pointer.x;
          const awayY = star.y - pointer.y;
          const distance = Math.hypot(awayX, awayY) || 1;
          if (distance < NUDGE_REACH) {
            pushX = (awayX / distance) * (1 - distance / NUDGE_REACH) * NUDGE;
            pushY = (awayY / distance) * (1 - distance / NUDGE_REACH) * NUDGE;
          }
        }
        star.dx += (pushX - star.dx) * ease;
        star.dy += (pushY - star.dy) * ease;
        cells[
          Math.min(rows - 1, Math.max(0, Math.floor((star.y + EDGE) / REACH))) * columns +
            Math.min(columns - 1, Math.max(0, Math.floor((star.x + EDGE) / REACH)))
        ].push(index);
        dots[
          Math.min(
            LEVELS - 1,
            Math.floor(
              (0.5 + 0.5 * Math.sin(star.phase + (seconds * TURN) / star.period)) * LEVELS,
            ),
          )
        ].push(star.x + star.dx, star.y + star.dy, star.size);
      });
      for (let row = 0; row < rows; row += 1) {
        for (let column = 0; column < columns; column += 1) {
          const cell = cells[row * columns + column];
          cell.forEach((index, position) => {
            for (let next = position + 1; next < cell.length; next += 1) {
              link(stars[index], stars[cell[next]]);
            }
            for (const [right, down] of FORWARD_CELLS) {
              if (column + right >= 0 && column + right < columns && row + down < rows) {
                for (const other of cells[(row + down) * columns + column + right]) {
                  link(stars[index], stars[other]);
                }
              }
            }
          });
        }
      }

      context.clearRect(0, 0, width, height);
      lines.forEach((level, index) => {
        context.strokeStyle = `rgba(${INK}, ${(LINE_ALPHA * (index + 1)) / LEVELS})`;
        context.beginPath();
        for (let at = 0; at < level.length; at += 4) {
          context.moveTo(level[at], level[at + 1]);
          context.lineTo(level[at + 2], level[at + 3]);
        }
        context.stroke();
      });
      dots.forEach((level, index) => {
        context.fillStyle = `rgba(${INK}, ${DOT_ALPHA * (0.75 + (0.5 * index) / (LEVELS - 1))})`;
        context.beginPath();
        for (let at = 0; at < level.length; at += 3) {
          context.moveTo(level[at] + level[at + 2], level[at + 1]);
          context.arc(level[at], level[at + 1], level[at + 2], 0, TURN);
        }
        context.fill();
      });

      const star = stars[flared];
      const progress = (now - flaredAt) / FLARE_MS;
      if (star && progress < 1) {
        const fade = (1 - progress) / 0.85;
        const glow = progress < 0.15 ? progress / 0.15 : fade * fade * (3 - 2 * fade);
        const x = star.x + star.dx;
        const y = star.y + star.dy;
        context.strokeStyle = `rgba(${INK}, ${0.32 * glow})`;
        context.beginPath();
        for (const other of stars) {
          if (
            other !== star &&
            Math.hypot(other.x + other.dx - x, other.y + other.dy - y) < REACH
          ) {
            context.moveTo(x, y);
            context.lineTo(other.x + other.dx, other.y + other.dy);
          }
        }
        context.stroke();
        context.fillStyle = `rgba(${INK}, ${0.9 * glow})`;
        context.beginPath();
        context.arc(x, y, star.size * (1 + glow), 0, TURN);
        context.fill();
      }
    },
  };
}

export function Sky() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const sky = useRef<ReturnType<typeof createSky>>(null);
  const shown = useContext(MotionContext).includes('backdrop');
  const still = useReducedMotion();

  useLiveMessages((message) => {
    if (message.console) {
      sky.current?.flare(performance.now());
    }
  });

  useEffect(() => {
    const element = canvas.current;
    if (!element) {
      return;
    }
    let frame = 0;
    let wait: ReturnType<typeof setTimeout> | undefined;
    let last = 0;
    let stop = () => {};
    const idle = (window.requestIdleCallback ?? setTimeout)(() => {
      const created = createSky(element);
      sky.current = created;
      created.resize();
      if (still) {
        const observer = new ResizeObserver(() => {
          created.resize();
          created.draw(0, 0);
        });
        observer.observe(element);
        stop = () => observer.disconnect();
        return;
      }
      const step = (now: number) => {
        created.draw(now, Math.min(0.1, (now - last) / 1000));
        last = now;
        wait = setTimeout(() => {
          frame = requestAnimationFrame(step);
        }, FRAME_MS - 4);
      };
      const halt = () => {
        clearTimeout(wait);
        cancelAnimationFrame(frame);
      };
      const run = () => {
        halt();
        if (!document.hidden) {
          last = performance.now();
          frame = requestAnimationFrame(step);
        }
      };
      const move = (event: PointerEvent) =>
        created.point(
          event.pointerType === 'mouse' ? { x: event.clientX, y: event.clientY } : null,
        );
      const leave = () => created.point(null);
      const observer = new ResizeObserver(created.resize);
      observer.observe(element);
      addEventListener('pointermove', move, { passive: true });
      document.documentElement.addEventListener('pointerleave', leave);
      document.addEventListener('visibilitychange', run);
      run();
      stop = () => {
        halt();
        observer.disconnect();
        removeEventListener('pointermove', move);
        document.documentElement.removeEventListener('pointerleave', leave);
        document.removeEventListener('visibilitychange', run);
      };
    });
    return () => {
      (window.cancelIdleCallback ?? clearTimeout)(idle);
      stop();
      sky.current = null;
    };
  }, [shown, still]);

  return shown ? <canvas ref={canvas} className="ambient-sky" aria-hidden="true" /> : null;
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
    const dpr = Math.min(devicePixelRatio || 1, 2);
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
    let stop: (() => void) | undefined;
    const draw = () => {
      let moving = pointer !== null;
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
          moving ||= Math.abs(point.vx) + Math.abs(point.vy) > 0.02;
        }
        context.fillRect(point.x, point.y, 1.6 * dpr, 1.6 * dpr);
      }
      if (!moving) {
        stop?.();
        stop = undefined;
      }
    };
    if (!allowed) {
      draw();
      return;
    }
    const move = (event: PointerEvent) => {
      const box = element.getBoundingClientRect();
      pointer = { x: (event.clientX - box.left) * dpr, y: (event.clientY - box.top) * dpr };
      stop ??= onFrame(draw);
    };
    const leave = () => {
      pointer = null;
    };
    element.addEventListener('pointermove', move);
    element.addEventListener('pointerleave', leave);
    stop = onFrame(draw);
    return () => {
      stop?.();
      element.removeEventListener('pointermove', move);
      element.removeEventListener('pointerleave', leave);
    };
  }, [allowed, text]);

  return <canvas ref={canvas} aria-hidden="true" />;
}
