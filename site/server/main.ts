import path from 'node:path';
import type { RequestHandler } from 'express';
import type { ServerBuild } from 'react-router';
import { refreshCloudflareRanges } from './address.ts';
import { createAdmin } from './admin.ts';
import { createApp } from './app.ts';
import { createMessages } from './messages.ts';
import { createShare } from './share.ts';
import { createAuth } from './auth.ts';
import { createBus } from './bus.ts';
import { createCollab } from './collab.ts';
import { config } from './config.ts';
import { createJobs } from './jobs.ts';
import { createPosts } from './posts.ts';
import { openDatabase } from './db.ts';
import { createErrors } from './errors.ts';
import { runLifecycle } from './lifecycle.ts';
import { createLive } from './live.ts';
import { log } from './log.ts';
import { alertOwner, sendEmail } from './mail.ts';
import { createMetrics } from './metrics.ts';
import { connectRedis, slidingLimit } from './redis.ts';
import { createSessions } from './sessions.ts';
import { github } from './github.ts';
import { createPresentations } from './presentation.ts';
import { createProfiles } from './profiles.ts';
import { createWriteback } from './writeback.ts';
import { createReads } from './reads.ts';
import { createUploads } from './uploads.ts';
import { createSettings } from './settings.ts';
import { createSnapshot } from './snapshot.ts';
import { createSubscribers } from './subscribers.ts';
import { createSync } from './sync.ts';
import { pingAll } from './uptime.ts';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const db = openDatabase(path.join(config.dataDir, 'hub.db'));
const uploadsDirectory = path.join(config.dataDir, 'uploads');
const { command: redis, subscriber } = connectRedis(config.redisUrl);
const bus = createBus(db, redis, subscriber);
await bus.ready;
const capture = createErrors(db, bus, alertOwner);
const sessions = createSessions(redis, config.sessionSecret);
const auth = createAuth(sessions, redis);
const live = createLive(bus, auth);
const writeback = createWriteback(db, bus, github);
const sync = createSync(db, bus, sessions, writeback);
const settings = createSettings(db, bus);
const snapshot = createSnapshot(db, bus, settings);
const jobs = createJobs(
  db,
  {
    publish: async (id) => {
      await posts.publishDue(id);
    },
    email: async () => {
      await subscribers.sends.drain();
    },
    digest: async () => {
      subscribers.runDigest();
    },
  },
  capture,
);
const subscribers = createSubscribers(db, jobs, bus, {
  secret: config.sessionSecret,
  origin: new URL(config.appUrl).origin,
  allow: (address) => slidingLimit(redis, `subscribe:${address}`, 5, HOUR),
  settings: settings.get,
  directory: snapshot.get,
  deliver: sendEmail,
  testAddress: config.alertsEmail,
});
const posts = createPosts(db, bus, jobs, subscribers.queuePost);
const collab = createCollab(db, posts, sessions);

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
    share: createShare(),
    profiles: createProfiles(db, bus),
    presentations: createPresentations(db, bus),
    writeback,
    uploads: createUploads(db, uploadsDirectory, (owner) =>
      slidingLimit(redis, `uploads:${owner}`, 20, HOUR),
    ),
    messages: createMessages(
      db,
      bus,
      (address) => slidingLimit(redis, `messages:${address}`, 3, 3_600_000),
      config.sessionSecret,
    ),
    posts,
    subscribers,
    collab,
    auth,
    live,
    sync,
    capture,
    metrics: createMetrics(),
  },
  loadBuild,
  uploadsDirectory,
  assets,
);
const server = app.listen(config.port, () => log.info({ port: config.port }, 'listening'));
server.on('upgrade', collab.upgrade);
subscribers.start();
jobs.start();

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
  jobs.stop();
  collab.destroy();
  server.close();
  server.closeAllConnections();
  Promise.allSettled([redis.quit(), subscriber.quit()]).then(() => {
    db.close();
    process.exit(0);
  });
});
