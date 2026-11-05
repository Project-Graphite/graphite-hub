import sharp from 'sharp';
import { shareHash, type ShareCard } from '../app/share.ts';

const WIDTH = 1200;
const HEIGHT = 630;
const KEEP = 200;
const FONT = "'DejaVu Sans', 'Segoe UI', sans-serif";
const MONO = "'DejaVu Sans Mono', Consolas, monospace";

function escape(text: string) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function wrap(text: string, width: number, lines: number) {
  const result: string[] = [];
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const last = result.at(-1);
    if (last !== undefined && `${last} ${word}`.length <= width) {
      result[result.length - 1] = `${last} ${word}`;
    } else {
      result.push(word);
    }
  }
  if (result.length > lines) {
    result.length = lines;
    result[lines - 1] = `${result[lines - 1].slice(0, width - 1).trimEnd()}…`;
  }
  return result;
}

export function shareSvg(card: ShareCard) {
  const title = wrap(card.title, 24, 3);
  const titleTop = 320;
  const subtitle = wrap(card.subtitle, 58, 4 - title.length);
  const subtitleTop = titleTop + (title.length - 1) * 80 + 64;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <defs>
    <radialGradient id="tint" cx="100%" cy="0%" r="95%">
      <stop offset="0%" stop-color="${card.accent}" stop-opacity="0.35"/>
      <stop offset="70%" stop-color="#0c0c0e" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="#0c0c0e"/>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#tint)"/>
  <rect x="0" y="0" width="${WIDTH}" height="6" fill="${card.accent}"/>
  <g transform="translate(80 86) scale(0.9)" fill="none" stroke="#e8e8ea" stroke-width="6" stroke-linecap="round" stroke-linejoin="round">
    <path d="M5.62 25 L0 40 M24.38 25 L30 40"/>
    <path d="M15 0 L8.25 18 H21.75 Z" fill="#e8e8ea"/>
  </g>
  <text x="122" y="118" font-family="${FONT}" font-size="30" font-weight="600" fill="#e8e8ea">Project Graphite</text>
  <text x="80" y="236" font-family="${MONO}" font-size="24" fill="#7d7d87">${escape(card.label)}</text>
  ${title.map((line, index) => `<text x="80" y="${titleTop + index * 80}" font-family="${FONT}" font-size="68" font-weight="700" fill="#e8e8ea">${escape(line)}</text>`).join('\n  ')}
  ${subtitle.map((line, index) => `<text x="80" y="${subtitleTop + index * 40}" font-family="${FONT}" font-size="28" fill="#8b8b95">${escape(line)}</text>`).join('\n  ')}
</svg>`;
}

export function createShare() {
  const cache = new Map<string, Buffer>();
  return async function image(card: ShareCard) {
    const key = shareHash(card);
    const cached = cache.get(key);
    if (cached) {
      return cached;
    }
    const png = await sharp(Buffer.from(shareSvg(card)))
      .png({ compressionLevel: 9 })
      .toBuffer();
    cache.set(key, png);
    if (cache.size > KEEP) {
      cache.delete(cache.keys().next().value!);
    }
    return png;
  };
}

export type Share = ReturnType<typeof createShare>;
