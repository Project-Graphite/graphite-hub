import { createHmac, createSign, timingSafeEqual } from 'node:crypto';
import { config } from './config.ts';

let installation: { token: string; expires: number } | undefined;

export class GitHubError extends Error {
  readonly status: number;

  constructor(status: number, path: string) {
    super(`GitHub answered ${status} for ${path}`);
    this.status = status;
  }
}

async function call(path: string, token: string | undefined, init: RequestInit, accept: string) {
  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: accept,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'project-graphite-hub',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new GitHubError(response.status, path);
  }
  return response;
}

export async function request<T>(path: string, token: string | undefined, init: RequestInit = {}) {
  const response = await call(path, token, init, 'application/vnd.github+json');
  return (response.status === 204 ? undefined : await response.json()) as T;
}

function appJwt(clientId: string, privateKey: string) {
  const now = Math.floor(Date.now() / 1000);
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const unsigned = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({ iat: now - 60, exp: now + 540, iss: clientId })}`;
  return `${unsigned}.${createSign('RSA-SHA256').update(unsigned).sign(privateKey, 'base64url')}`;
}

async function token() {
  if (!config.app) {
    return config.githubToken;
  }
  if (installation && installation.expires > Date.now() + 300_000) {
    return installation.token;
  }
  const jwt = appJwt(config.app.clientId, config.app.privateKey);
  const { id } = await request<{ id: number }>(`/orgs/${config.organisation}/installation`, jwt);
  const created = await request<{ token: string; expires_at: string }>(
    `/app/installations/${id}/access_tokens`,
    jwt,
    { method: 'POST' },
  );
  installation = { token: created.token, expires: Date.parse(created.expires_at) };
  return installation.token;
}

export async function github<T>(path: string, init?: RequestInit) {
  return request<T>(path, await token(), init);
}

export async function githubText(path: string) {
  return (await call(path, await token(), {}, 'application/vnd.github.raw+json')).text();
}

export async function paginate<T>(path: string) {
  const items: T[] = [];
  for (let page = 1; ; page += 1) {
    const batch = await github<T[]>(
      `${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`,
    );
    items.push(...batch);
    if (batch.length < 100) {
      return items;
    }
  }
}

export function validSignature(secret: string, body: Buffer, header: string | undefined) {
  const expected = Buffer.from(`sha256=${createHmac('sha256', secret).update(body).digest('hex')}`);
  const given = Buffer.from(header ?? '');
  return given.length === expected.length && timingSafeEqual(given, expected);
}
