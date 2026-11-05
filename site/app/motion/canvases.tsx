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

function scale() {
  return Math.min(devicePixelRatio || 1, 2);
}

export function Field() {
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
    let frame = 0;
    let pointer: { x: number; y: number } | null = null;
    const resize = () => {
      width = element.width = element.clientWidth * dpr;
      height = element.height = element.clientHeight * dpr;
    };
    resize();
    const points: Particle[] = Array.from({ length: 70 }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.12 * dpr,
      vy: (Math.random() - 0.5) * 0.12 * dpr,
      tx: 0,
      ty: 0,
    }));
    const draw = () => {
      context.clearRect(0, 0, width, height);
      const reach = 120 * dpr;
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
      for (let i = 0; i < points.length; i += 1) {
        for (let j = i + 1; j < points.length; j += 1) {
          const distance = Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y);
          if (distance < reach) {
            context.strokeStyle = `rgba(232,232,234,${(1 - distance / reach) * 0.14})`;
            context.lineWidth = dpr;
            context.beginPath();
            context.moveTo(points[i].x, points[i].y);
            context.lineTo(points[j].x, points[j].y);
            context.stroke();
          }
        }
      }
      context.fillStyle = 'rgba(232,232,234,.38)';
      for (const point of points) {
        context.beginPath();
        context.arc(point.x, point.y, 1.3 * dpr, 0, Math.PI * 2);
        context.fill();
      }
      frame = requestAnimationFrame(draw);
    };
    const move = (event: PointerEvent) => {
      const box = element.getBoundingClientRect();
      pointer = { x: (event.clientX - box.left) * dpr, y: (event.clientY - box.top) * dpr };
    };
    const leave = () => {
      pointer = null;
    };
    host.addEventListener('pointermove', move);
    host.addEventListener('pointerleave', leave);
    addEventListener('resize', resize);
    draw();
    return () => {
      cancelAnimationFrame(frame);
      host.removeEventListener('pointermove', move);
      host.removeEventListener('pointerleave', leave);
      removeEventListener('resize', resize);
    };
  }, [allowed]);

  return <canvas ref={canvas} className="field" aria-hidden="true" />;
}

export function Mark() {
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
    pen.strokeStyle = '#fff';
    pen.fillStyle = '#fff';
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
    const pixels = pen.getImageData(0, 0, size, size).data;
    const step = Math.max(2, Math.round(2.6 * dpr));
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
    let frame = 0;
    let pointer: { x: number; y: number } | null = null;
    const draw = () => {
      context.clearRect(0, 0, size, size);
      context.fillStyle = 'rgba(232,232,234,.85)';
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
      if (allowed) {
        frame = requestAnimationFrame(draw);
      }
    };
    const move = (event: PointerEvent) => {
      const box = element.getBoundingClientRect();
      pointer = { x: (event.clientX - box.left) * dpr, y: (event.clientY - box.top) * dpr };
    };
    const leave = () => {
      pointer = null;
    };
    element.addEventListener('pointermove', move);
    element.addEventListener('pointerleave', leave);
    draw();
    return () => {
      cancelAnimationFrame(frame);
      element.removeEventListener('pointermove', move);
      element.removeEventListener('pointerleave', leave);
    };
  }, [allowed]);

  return <canvas ref={canvas} aria-hidden="true" />;
}
