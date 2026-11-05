import { randomBytes } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import express, { type Request, type Response } from 'express';
import { clientAddress } from './address.ts';
import { config } from './config.ts';
import { GitHubError, request as asUser } from './github.ts';
import { slidingLimit, type Redis } from './redis.ts';
import { sameSecret, type Session, type Sessions } from './sessions.ts';

const SESSION_COOKIE = 'hub_session';
const STATE_COOKIE = 'hub_state';
const RECHECK_MS = 60_000;

export function cookies(request: IncomingMessage) {
  return Object.fromEntries(
    (request.headers.cookie ?? '').split(';').flatMap((part) => {
      const index = part.indexOf('=');
      return index > 0
        ? [[part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim())]]
        : [];
    }),
  );
}

function setCookie(response: ServerResponse, name: string, value: string, maxAge: number) {
  response.appendHeader(
    'Set-Cookie',
    `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${config.production ? '; Secure' : ''}`,
  );
}

export function safeReturn(path: unknown) {
  return typeof path === 'string' && /^\/(?![/\\])/.test(path) ? path : '/';
}

export function sameOrigin(request: IncomingMessage) {
  return request.headers.origin === new URL(config.appUrl).origin;
}

async function membership(token: string) {
  const found = await asUser<{ state: string; role: string }>(
    `/user/memberships/orgs/${config.organisation}`,
    token,
  ).catch((error: unknown) => {
    if (error instanceof GitHubError && [401, 403, 404].includes(error.status)) {
      return undefined;
    }
    throw error;
  });
  return found?.state === 'active' ? { owner: found.role === 'admin' } : undefined;
}

export function createAuth(sessions: Sessions, redis: Redis) {
  async function current(request: IncomingMessage, response: ServerResponse) {
    const id = cookies(request)[SESSION_COOKIE];
    const session = await sessions.read(id);
    if (!id || !session) {
      return undefined;
    }
    if (config.dev || Date.now() - session.checkedAt < RECHECK_MS) {
      return { id, session };
    }
    const token = sessions.githubToken(session);
    const member = token && (await membership(token).catch(() => session));
    if (!member) {
      await sessions.destroy(id, session.login);
      setCookie(response, SESSION_COOKIE, '', 0);
      return undefined;
    }
    const checked: Session = { ...session, owner: member.owner, checkedAt: Date.now() };
    await sessions.update(id, checked);
    return { id, session: checked };
  }

  async function begin(
    response: Response,
    login: string,
    owner: boolean,
    avatarUrl: string,
    token: string,
    to: string,
  ) {
    const id = await sessions.create(login, owner, avatarUrl, token);
    setCookie(response, SESSION_COOKIE, id, 7 * 86_400);
    response.redirect(303, to);
  }

  const router = express.Router();

  router.get('/auth/sign-in', async (request: Request, response: Response) => {
    if (!(await slidingLimit(redis, `sign-in:${clientAddress(request)}`, 10, 600_000))) {
      response
        .status(429)
        .type('text')
        .send('Too many sign-in attempts; try again in a few minutes.');
      return;
    }
    const to = safeReturn(request.query.return);
    if (config.dev) {
      await begin(
        response,
        config.dev.login,
        config.dev.owner,
        `https://avatars.githubusercontent.com/${config.dev.login}`,
        'dev',
        to,
      );
      return;
    }
    const state = randomBytes(16).toString('base64url');
    setCookie(response, STATE_COOKIE, `${state} ${to}`, 600);
    const query = new URLSearchParams({
      client_id: config.oauth!.clientId,
      redirect_uri: `${config.appUrl}/auth/callback`,
      scope: 'read:org',
      state,
    });
    response.redirect(302, `https://github.com/login/oauth/authorize?${query}`);
  });

  router.get('/auth/callback', async (request: Request, response: Response) => {
    const [state, to] = (cookies(request)[STATE_COOKIE] ?? '').split(' ');
    setCookie(response, STATE_COOKIE, '', 0);
    if (!state || !sameSecret(state, String(request.query.state ?? ''))) {
      response.status(400).type('text').send('The sign-in expired; start again.');
      return;
    }
    const exchange = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: config.oauth!.clientId,
        client_secret: config.oauth!.clientSecret,
        code: request.query.code,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const { access_token: token } = (await exchange.json()) as { access_token?: string };
    if (!token) {
      response.status(400).type('text').send('GitHub refused the sign-in; start again.');
      return;
    }
    const user = await asUser<{ login: string; avatar_url: string }>('/user', token);
    const member = await membership(token);
    if (!member) {
      response
        .status(403)
        .type('text')
        .send(`Signed out: ${user.login} is not a member of ${config.organisation}.`);
      return;
    }
    await begin(response, user.login, member.owner, user.avatar_url, token, safeReturn(to));
  });

  router.post(
    '/auth/sign-out',
    express.urlencoded({ extended: false }),
    async (request: Request, response: Response) => {
      const signedIn = await current(request, response);
      if (
        !signedIn ||
        !sameOrigin(request) ||
        !sameSecret(String(request.body?.csrf ?? ''), signedIn.session.csrf)
      ) {
        response.status(403).type('text').send('Sign-out refused.');
        return;
      }
      await sessions.destroy(signedIn.id, signedIn.session.login);
      setCookie(response, SESSION_COOKIE, '', 0);
      response.redirect(303, '/');
    },
  );

  return { router, current };
}

export type Auth = ReturnType<typeof createAuth>;
