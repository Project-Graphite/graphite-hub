import { randomBytes, randomUUID } from 'node:crypto';
import { createRequestHandler } from '@react-router/express';
import express, { type NextFunction, type Request, type Response } from 'express';
import { RouterContextProvider, type RouterContext, type ServerBuild } from 'react-router';
import type { Hub } from '../app/context.ts';
import type { Auth } from './auth.ts';
import type { Bus } from './bus.ts';
import { config } from './config.ts';
import type { Database } from './db.ts';
import { recordDeploy, validReport } from './deploys.ts';
import type { Capture } from './errors.ts';
import { validSignature } from './github.ts';
import { contentSecurityPolicy, securityHeaders } from './headers.ts';
import { createVerifier } from './internal.ts';
import type { Live } from './live.ts';
import { log } from './log.ts';
import type { createMetrics } from './metrics.ts';
import { slidingLimit, type Redis } from './redis.ts';
import { clientAddress } from './address.ts';
import type { Admin } from './admin.ts';
import { sameOrigin } from './auth.ts';
import type { Messages } from './messages.ts';
import type { Collab } from './collab.ts';
import type { Posts } from './posts.ts';
import type { Presence } from './presence.ts';
import type { Presentations } from './presentation.ts';
import type { Profiles } from './profiles.ts';
import type { Writeback } from './writeback.ts';
import type { Uploads } from './uploads.ts';
import type { Share } from './share.ts';
import type { Reads } from './reads.ts';
import type { Settings } from './settings.ts';
import type { Snapshot } from './snapshot.ts';
import type { Subscribers } from './subscribers.ts';
import type { Sync } from './sync.ts';
import type { Views } from './views.ts';

export interface Services {
  db: Database;
  redis: Redis;
  bus: Bus;
  snapshot: Snapshot;
  settings: Settings;
  reads: Reads;
  admin: Admin;
  messages: Messages;
  share: Share;
  profiles: Profiles;
  presentations: Presentations;
  writeback: Writeback;
  uploads: Uploads;
  posts: Posts;
  subscribers: Subscribers;
  collab: Collab;
  presence: Presence;
  views: Views;
  auth: Auth;
  live: Live;
  sync: Sync;
  capture: Capture;
  metrics: ReturnType<typeof createMetrics>;
}

const MOVED: Record<string, string> = {
  '/amr': '/members/amrmscll',
  '/members/amr': '/members/amrmscll',
  '/amr/windhawk-mods': '/windhawk-mods',
  '/projects/windhawk-mods/stack-switch': '/windhawk-mods/stack-switch',
  '/projects/windhawk-mods/tasktune': '/windhawk-mods/tasktune',
};

export function createApp(
  services: Services,
  loadBuild: () => Promise<ServerBuild>,
  uploadsDirectory: string,
  assets?: express.RequestHandler,
) {
  const { db, redis, bus, snapshot, settings, reads, admin, auth, live, sync, capture, metrics } =
    services;
  const verified = createVerifier(config.deployReportSecret);
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback, uniquelocal');

  app.use((request: Request, response: Response, next: NextFunction) => {
    const requestId = randomUUID();
    const started = performance.now();
    response.locals.requestId = requestId;
    response.setHeader('X-Request-Id', requestId);
    response.on('finish', () => {
      const ms = Math.round(performance.now() - started);
      const internal = request.path.startsWith('/internal/');
      if (request.path !== '/live' && !request.path.startsWith('/health/')) {
        metrics.observe(response.statusCode, ms);
      }
      log.info({
        requestId,
        method: request.method,
        route: request.path,
        status: response.statusCode,
        ms,
        ...(internal
          ? { delivery: request.headers['x-github-delivery'] }
          : { member: response.locals.member }),
      });
    });
    next();
  });
  app.use(securityHeaders);

  app.get('/health/live', (_request, response) => {
    response.type('text').send('ok');
  });
  app.get('/health/ready', async (_request, response) => {
    try {
      db.prepare('SELECT 1').get();
      snapshot.get();
      response.type('text').send((await bus.alive()) ? 'ready' : 'ready; the live bus is down');
    } catch (error) {
      log.warn({ err: error }, 'not ready');
      response.status(503).type('text').send('not ready');
    }
  });

  app.post(
    '/internal/github',
    express.raw({ type: 'application/json', limit: '5mb' }),
    async (request, response) => {
      const delivery = String(request.headers['x-github-delivery'] ?? '');
      const event = String(request.headers['x-github-event'] ?? '');
      if (!(await slidingLimit(redis, 'webhook', 600, 60_000))) {
        response.status(429).end();
        return;
      }
      if (
        !config.webhookSecret ||
        !delivery ||
        !validSignature(
          config.webhookSecret,
          request.body,
          request.headers['x-hub-signature-256'] as string | undefined,
        )
      ) {
        response.status(404).end();
        return;
      }
      const { changes } = db
        .prepare(
          'INSERT OR IGNORE INTO webhook_deliveries (delivery_id, event, received_at) VALUES (?, ?, ?)',
        )
        .run(delivery, event, new Date().toISOString());
      response.status(changes > 0 ? 202 : 200).end();
      if (changes > 0) {
        sync
          .webhook(event, JSON.parse(request.body.toString('utf8')))
          .then(() =>
            db
              .prepare('UPDATE webhook_deliveries SET processed_at = ? WHERE delivery_id = ?')
              .run(new Date().toISOString(), delivery),
          )
          .catch((error: unknown) =>
            capture(error, {
              route: `/internal/github ${event}`,
              requestId: response.locals.requestId,
            }),
          );
      }
    },
  );

  app.post(
    '/internal/deploys',
    express.raw({ type: 'application/json', limit: '64kb' }),
    async (request, response) => {
      if (!verified(request, request.body)) {
        response.status(404).end();
        return;
      }
      const report: unknown = JSON.parse(request.body.toString('utf8'));
      if (!validReport(report)) {
        response.status(400).type('text').send('Not a deploy report.');
        return;
      }
      await recordDeploy(db, bus, report);
      response.status(204).end();
    },
  );

  app.get('/internal/metrics', (request, response) => {
    if (!verified(request, Buffer.alloc(0))) {
      response.status(404).end();
      return;
    }
    response.json(metrics.snapshot(live.connections));
  });

  app.use((request, response, next) => {
    const path = request.path.replace(/(.)\/$/, '$1');
    const target = MOVED[path];
    if (target && !services.profiles.handleForAlias(path.split('/')[1])) {
      response.redirect(301, target);
    } else {
      next();
    }
  });

  app.use(auth.router);
  app.get('/live', live.handler);
  app.post('/views/:kind/:key', async (request, response) => {
    if (sameOrigin(request)) {
      await services.views.count({
        kind: request.params.kind,
        key: request.params.key,
        address: clientAddress(request),
        userAgent: String(request.headers['user-agent'] ?? ''),
      });
    }
    response.status(204).end();
  });
  app.get('/admin/email', async (request, response) => {
    const signedIn = await auth.current(request, response);
    const kind = String(request.query.kind ?? '');
    if (!signedIn?.session.owner || !['confirm', 'post', 'digest'].includes(kind)) {
      response.status(404).end();
      return;
    }
    response.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' https: data:",
    );
    response.setHeader('Cache-Control', 'no-store');
    response
      .type('html')
      .send(services.subscribers.preview(kind as 'confirm' | 'post' | 'digest').html);
  });
  app.use(
    '/uploads',
    express.static(uploadsDirectory, {
      immutable: true,
      maxAge: '1y',
      index: false,
      dotfiles: 'deny',
      setHeaders: (response) => response.setHeader('Content-Disposition', 'inline'),
    }),
  );

  if (assets) {
    app.use(assets);
  } else {
    app.use(
      '/assets',
      express.static('build/client/assets', { immutable: true, maxAge: '1y', index: false }),
    );
    app.use(express.static('build/client', { maxAge: '1h', index: false }));
  }

  app.all(
    '/{*path}',
    createRequestHandler({
      build: loadBuild,
      async getLoadContext(request, response) {
        const build = await loadBuild();
        const signedIn = await auth.current(request, response);
        const nonce = randomBytes(16).toString('base64');
        response.locals.member = signedIn?.session.login;
        if (config.production) {
          response.setHeader('Content-Security-Policy', contentSecurityPolicy(nonce));
        }
        const context = new RouterContextProvider();
        context.set(
          (build.entry.module as unknown as { hubContext: RouterContext<Hub> }).hubContext,
          {
            directory: snapshot.get(),
            settings: settings.get(),
            reads,
            admin,
            messages: services.messages,
            share: services.share,
            profiles: services.profiles,
            presentations: services.presentations,
            writeback: services.writeback,
            uploads: services.uploads,
            posts: services.posts,
            subscribers: services.subscribers,
            collab: services.collab,
            presence: services.presence,
            views: services.views,
            address: clientAddress(request),
            origin: new URL(config.appUrl).origin,
            viewer: signedIn
              ? {
                  login: signedIn.session.login,
                  avatarUrl: signedIn.session.avatarUrl,
                  owner: signedIn.session.owner,
                }
              : null,
            csrf: signedIn?.session.csrf ?? null,
            nonce,
            requestId: response.locals.requestId,
            capture,
          },
        );
        return context;
      },
    }),
  );

  app.use((error: unknown, request: Request, response: Response, _next: NextFunction) => {
    capture(error, { route: request.path, requestId: response.locals.requestId });
    if (!response.headersSent) {
      response
        .status(500)
        .type('text')
        .send(`Something went wrong. Request ${response.locals.requestId}.`);
    }
  });

  return app;
}
