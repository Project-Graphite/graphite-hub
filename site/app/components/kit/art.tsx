import type { CSSProperties } from 'react';

const WIDTH = 320;
const HEIGHT = 120;
const REACH = 36;

interface Star {
  x: number;
  y: number;
  r: number;
}

function random(seed: string) {
  let state = 2166136261;
  for (const char of seed) {
    state = Math.imul(state ^ char.charCodeAt(0), 16777619);
  }
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const fix = (value: number) => Number(value.toFixed(1));

function compose(seed: string) {
  const next = random(seed);
  const focus = { x: WIDTH * (0.3 + next() * 0.4), y: HEIGHT * (0.32 + next() * 0.36) };
  const tilt = fix(-28 + next() * 56);
  const stars: Star[] = Array.from({ length: 28 + Math.floor(next() * 10) }, () => {
    if (next() < 0.5) {
      const angle = next() * Math.PI * 2;
      const radius = 12 + next() * 64;
      return {
        x: fix(focus.x + Math.cos(angle) * radius * 1.5),
        y: fix(focus.y + Math.sin(angle) * radius * 0.65),
        r: fix(0.7 + next() * 1.3),
      };
    }
    return { x: fix(next() * WIDTH), y: fix(next() * HEIGHT), r: fix(0.6 + next() * 1.1) };
  });
  const links: { a: Star; b: Star; alpha: number }[] = [];
  for (let i = 0; i < stars.length; i += 1) {
    for (let j = i + 1; j < stars.length; j += 1) {
      const distance = Math.hypot(stars[i].x - stars[j].x, stars[i].y - stars[j].y);
      if (distance < REACH) {
        links.push({ a: stars[i], b: stars[j], alpha: fix((1 - distance / REACH) * 0.32) });
      }
    }
  }
  const bright = [...stars]
    .sort((a, b) => b.r - a.r)
    .slice(0, 4 + Math.floor(next() * 3))
    .map((star, index) => ({ ...star, delay: fix(index * 0.7) }));
  const anchor = bright[0];
  const sigil = [...stars]
    .filter((star) => star !== anchor)
    .sort(
      (a, b) =>
        Math.hypot(a.x - anchor.x, a.y - anchor.y) - Math.hypot(b.x - anchor.x, b.y - anchor.y),
    )
    .slice(0, 3 + Math.floor(next() * 3));
  const rings = Array.from({ length: 1 + Math.floor(next() * 3) }, (_, index) => ({
    rx: fix(34 + index * 30 + next() * 14),
    ry: fix(14 + index * 11 + next() * 6),
  }));
  return { focus, tilt, stars, links, bright, anchor, sigil, rings };
}

const accentFill = { fill: 'var(--accent, #8b8b95)' } as CSSProperties;
const accentStroke = { stroke: 'var(--accent, #8b8b95)' } as CSSProperties;

export function Art({ seed }: { seed: string }) {
  const { focus, tilt, stars, links, bright, anchor, sigil, rings } = compose(seed);
  const glow = `glow-${seed.replace(/[^a-z0-9]/gi, '')}`;
  return (
    <svg
      className="art"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <defs>
        <radialGradient id={glow} cx={focus.x / WIDTH} cy={focus.y / HEIGHT} r={0.42}>
          <stop offset="0" style={{ stopColor: 'var(--accent, #8b8b95)' }} stopOpacity={0.28} />
          <stop offset="1" style={{ stopColor: 'var(--accent, #8b8b95)' }} stopOpacity={0} />
        </radialGradient>
      </defs>
      <rect width={WIDTH} height={HEIGHT} fill={`url(#${glow})`} />
      <g
        fill="none"
        stroke="#e8e8ea"
        strokeOpacity={0.08}
        strokeDasharray="1.5 5"
        transform={`rotate(${tilt} ${fix(focus.x)} ${fix(focus.y)})`}
      >
        {rings.map((ring) => (
          <ellipse key={ring.rx} cx={fix(focus.x)} cy={fix(focus.y)} rx={ring.rx} ry={ring.ry} />
        ))}
      </g>
      <g stroke="#e8e8ea" strokeWidth={0.6}>
        {links.map((link, index) => (
          <line
            key={index}
            x1={link.a.x}
            y1={link.a.y}
            x2={link.b.x}
            y2={link.b.y}
            strokeOpacity={link.alpha}
          />
        ))}
      </g>
      <g fill="#e8e8ea" fillOpacity={0.55}>
        {stars.map((star, index) => (
          <circle key={index} cx={star.x} cy={star.y} r={star.r} />
        ))}
      </g>
      <polygon
        className="sigil"
        points={[anchor, ...sigil].map((star) => `${star.x},${star.y}`).join(' ')}
        fill="none"
        strokeWidth={0.8}
        strokeOpacity={0.6}
        strokeLinejoin="round"
        style={accentStroke}
      />
      <g style={accentFill}>
        {bright.map((star, index) => (
          <g key={index} className="star" style={{ '--d': `${star.delay}s` } as CSSProperties}>
            <circle cx={star.x} cy={star.y} r={star.r * 4} fillOpacity={0.14} />
            <circle cx={star.x} cy={star.y} r={star.r + 1.2} />
          </g>
        ))}
      </g>
    </svg>
  );
}
