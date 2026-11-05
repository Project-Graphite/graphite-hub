import path from 'node:path';
import type { RequestHandler } from 'express';
import type { ServerBuild } from 'react-router';
import { refreshCloudflareRanges } from './address.ts';
import { createAdmin } from './admin.ts';
import { createApp } from './app.ts';
import { createMessages } from './messages.ts';
import { createAuth } from './auth.ts';
import { createBus } from './bus.ts';
import { config } from './config.ts';
import { openDatabase } from './db.ts';
import { createErrors } from './errors.ts';
import { runLifecycle } from './lifecycle.ts';
import { createLive } from './live.ts';
import { log } from './log.ts';
import { alertOwner } from './mail.ts';
import { createMetrics } from './metrics.ts';
import { connectRedis, slidingLimit } from './redis.ts';
import { createSessions } from './sessions.ts';
import { createReads } from './reads.ts';
import { createSettings } from './settings.ts';
import { createSnapshot } from './snapshot.ts';
import { createSync } from './sync.ts';
import { pingAll } from './uptime.ts';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const db = openDatabase(path.join(config.dataDir, 'hub.db'));
const { command: redis, subscriber } = connectRedis(config.redisUrl);
const bus = createBus(db, redis, subscriber);
await bus.ready;
const capture = createErrors(db, bus, alertOwner);
const sessions = createSessions(redis, config.sessionSecret);
const auth = createAuth(sessions, redis);
const live = createLive(bus, auth);
const sync = createSync(db, bus, sessions);
const settings = createSettings(db, bus);
const snapshot = createSnapshot(db, bus, settings);

process.on('unhandledRejection', (reason) => capture(reason, { route: 'process' }));
process.on('uncaughtExceptionMonitor', (error) => capture(error, { route: 'process' }));

let loadBuild: () => Promise<ServerBuild>;
let assets: RequestHandler | undefined;
if (config.production) {
  const build = (await import(
    new URL('../build/server/index.js', import.meta.url).href
  )) as ServerBuild;
  loadBuild = async () => build;
} else {
  const vite = await import('vite').then(({ createServer }) =>
    createServer({ server: { middlewareMode: true } }),
  );
  loadBuild = () => vite.ssrLoadModule('virtual:react-router/server-build') as Promise<ServerBuild>;
  assets = vite.middlewares;
}

const app = createApp(
  {
    db,
    redis,
    bus,
    snapshot,
    settings,
    reads: createReads(db),
    admin: createAdmin(db, bus, settings, sessions),
    messages: createMessages(
      db,
      bus,
      (address) => slidingLimit(redis, `messages:${address}`, 3, 3_600_000),
      config.sessionSecret,
    ),
    auth,
    live,
    sync,
    capture,
    metrics: createMetrics(),
  },
  loadBuild,
  assets,
);
const server = app.listen(config.port, () => log.info({ port: config.port }, 'listening'));

function every(name: string, ms: number, job: () => Promise<unknown>) {
  const run = () => job().catch((error: unknown) => capture(error, { route: `job:${name}` }));
  run();
  return setInterval(run, ms);
}

function nightly(name: string, hourUtc: number, job: () => Promise<unknown>) {
  const next = new Date();
  next.setUTCHours(hourUtc, 30, 0, 0);
  if (next.getTime() <= Date.now()) {
    next.setTime(next.getTime() + DAY);
  }
  const start = setTimeout(() => {
    timers.push(every(name, DAY, job));
  }, next.getTime() - Date.now());
  return start;
}

const timers = [
  every('cloudflare-ranges', DAY, refreshCloudflareRanges),
  every('full-sync', HOUR, sync.full),
  every('uptime', 30_000, () => pingAll(db, bus)),
  nightly('lifecycle', 3, () => runLifecycle(db, redis, bus)),
];

process.on('SIGTERM', () => {
  log.info('shutting down');
  timers.forEach(clearTimeout);
  server.close();
  server.closeAllConnections();
  Promise.allSettled([redis.quit(), subscriber.quit()]).then(() => {
    db.close();
    process.exit(0);
  });
});
