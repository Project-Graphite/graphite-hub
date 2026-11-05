import { createHmac } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { viaEdge } from './address.ts';
import { sameSecret } from './sessions.ts';

const SKEW_SECONDS = 300;

export function sign(secret: string, stamp: string, body: Buffer | string) {
  return createHmac('sha256', secret).update(`${stamp}.`).update(body).digest('hex');
}

export function createVerifier(secret: string | undefined, now = () => Date.now()) {
  const seen = new Map<string, number>();
  return function verified(request: IncomingMessage, body: Buffer) {
    const stamp = String(request.headers['x-graphite-timestamp'] ?? '');
    const signature = String(request.headers['x-graphite-signature'] ?? '');
    const at = now();
    if (
      !secret ||
      viaEdge(request) ||
      !/^\d+$/.test(stamp) ||
      Math.abs(at / 1000 - Number(stamp)) > SKEW_SECONDS
    ) {
      return false;
    }
    if (!sameSecret(sign(secret, stamp, body), signature)) {
      return false;
    }
    for (const [key, until] of seen) {
      if (until < at) {
        seen.delete(key);
      }
    }
    if (seen.has(signature)) {
      return false;
    }
    seen.set(signature, at + 2 * SKEW_SECONDS * 1000);
    return true;
  };
}
