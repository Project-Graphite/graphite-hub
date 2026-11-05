import type { IncomingMessage } from 'node:http';
import { BlockList, isIPv6 } from 'node:net';

let cloudflare = new BlockList();

export function cloudflareRanges(text: string) {
  const ranges = new BlockList();
  for (const line of text.split(/\s+/).filter(Boolean)) {
    const [address, prefix] = line.split('/');
    ranges.addSubnet(address, Number(prefix), isIPv6(address) ? 'ipv6' : 'ipv4');
  }
  return ranges;
}

export async function refreshCloudflareRanges() {
  const lists = await Promise.all(
    ['https://www.cloudflare.com/ips-v4', 'https://www.cloudflare.com/ips-v6'].map(async (url) => {
      const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (!response.ok) {
        throw new Error(`Cloudflare answered ${response.status} for ${url}`);
      }
      return response.text();
    }),
  );
  cloudflare = cloudflareRanges(lists.join('\n'));
}

function plain(address: string) {
  return address.replace(/^::ffff:(?=\d+\.\d+\.\d+\.\d+$)/, '');
}

export function inRanges(ranges: BlockList, address: string) {
  const bare = plain(address);
  return ranges.check(bare, isIPv6(bare) ? 'ipv6' : 'ipv4');
}

export function viaEdge(request: IncomingMessage) {
  return request.headers['x-forwarded-for'] !== undefined;
}

export function clientAddress(request: IncomingMessage, ranges = cloudflare) {
  const forwarded = (request.headers['x-forwarded-for'] as string | undefined)
    ?.split(',')
    .map((part) => part.trim());
  const peer = plain(forwarded?.at(-1) ?? request.socket.remoteAddress ?? '');
  const original = request.headers['cf-connecting-ip'] as string | undefined;
  return forwarded && original && inRanges(ranges, peer) ? plain(original) : peer;
}
