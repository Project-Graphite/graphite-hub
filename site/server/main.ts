import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import type { RequestHandler } from 'express';
import type { ServerBuild } from 'react-router';
import { countryOf, refreshCloudflareRanges } from './address.ts';
import { createAdmin } from './admin.ts';
import { createApp } from './app.ts';
import { createMessages } from './messages.ts';
import { createShare } from './share.ts';
import { createAuth } from './auth.ts';
import { createBus } from './bus.ts';
import { createCollab } from './collab.ts';
import { config } from './config.ts';
import { createEdit } from './edit.ts';
import { createJobs } from './jobs.ts';
import { createPosts } from './posts.ts';
import { closeDatabase, openDatabase } from './db.ts';
import { createErrors } from './errors.ts';
import { runLifecycle } from './lifecycle.ts';
import { createLive } from './live.ts';
import { log } from './log.ts';
import { alertOwner, sendEmail } from './mail.ts';
import { createMetrics } from './metrics.ts';
import { connectRedis, slidingLimit } from './redis.ts';
import { createSessions } from './sessions.ts';
import { createPresence } from './presence.ts';
import { createProfiles } from './profiles.ts';
import { createProjects } from './projects.ts';
import { createReads } from './reads.ts';
import { createUploads } from './uploads.ts';
import { createSettings } from './settings.ts';
import { createSnapshot } from './snapshot.ts';
import { createSubscribers } from './subscribers.ts';
import { createSync } from './sync.ts';
import { closeDays, createHealth, HEALTH_JOB } from './uptime.ts';
import { createViews } from './views.ts';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const DRAIN_MS = 8000;

const db = openDatabase(path.join(config.dataDir, 'hub.db'));
closeDays(db, new Date().toISOString().slice(0, 10));
const uploadsDirectory = path.join(config.dataDir, 'uploads');
const redis = connectRedis(config.redisUrl);
const bus = createBus(db, redis);
const capture = createErrors(db, bus, alertOwner);
const sessions = createSessions(redis, config.sessionSecret);
const auth = createAuth(sessions, redis);
const presence = createPresence(redis, bus);
const live = createLive(bus, auth, presence, {
  handleOf: (login) =>
    db
      .prepare('SELECT handle FROM members WHERE login = ? COLLATE NOCASE AND left_at IS NULL')
      .get(login)?.handle as string | undefined,
  countryOf: (request) => (config.dev ? countryOf(request, true) : countryOf(request)),
});
const sync = createSync(db, bus, sessions, capture);
const settings = createSettings(db, bus);
const snapshot = createSnapshot(db, bus, settings);
const views = createViews(db, redis, bus, {
  exists: (kind, key) =>
    kind === 'post'
      ? snapshot.get().posts.some((post) => post.id === key)
      : snapshot.get().projects.some((project) => project.slug === key),
  title: (kind, key) =>
    kind === 'post'
      ? snapshot
          .get()
          .posts.filter((post) => post.id === key)
          .map((post) => `“${post.title}”`)[0]
      : snapshot.get().projects.find((project) => project.slug === key)?.name,
  allow: (address) => slidingLimit(redis, `views:${address}`, 30, MINUTE),
});
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
    [HEALTH_JOB]: async () => {
      health.arm();
      await health.digest();
    },
  },
  capture,
);
const health = createHealth(db, bus, jobs);
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
const collab = createCollab(db, posts, sessions, bus);
const profiles = createProfiles(db, bus);
const projects = createProjects(db, bus);
const uploads = createUploads(db, uploadsDirectory, (owner) =>
  slidingLimit(redis, `uploads:${owner}`, 20, HOUR),
);

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
    reads: createReads(db, bus),
    admin: createAdmin(db, bus, settings, sessions),
    share: createShare(),
    profiles,
    projects,
    edit: createEdit(db, { settings, profiles, projects, uploads }),
    uploads,
    messages: createMessages(
      db,
      bus,
      (address) => slidingLimit(redis, `messages:${address}`, 3, 3_600_000),
      config.sessionSecret,
    ),
    posts,
    subscribers,
    collab,
    presence,
    views,
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
health.start();
jobs.start();
presence.start().catch((error: unknown) => capture(error, { route: 'presence' }));

const working = new Set<Promise<unknown>>();

function every(name: string, ms: number, job: () => Promise<unknown>) {
  const run = () => {
    const work = job()
      .catch((error: unknown) => capture(error, { route: `job:${name}` }))
      .finally(() => working.delete(work));
    working.add(work);
  };
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
  every('uptime', 30_000, health.ping),
  nightly('lifecycle', 3, () => runLifecycle(db, redis, bus, uploadsDirectory)),
];

process.on('SIGTERM', async () => {
  log.info('shutting down');
  timers.forEach(clearTimeout);
  presence.stop();
  server.close();
  await Promise.race([Promise.allSettled([jobs.stop(), ...working]), delay(DRAIN_MS)]);
  collab.destroy();
  server.closeAllConnections();
  await Promise.allSettled([redis.quit()]);
  closeDatabase(db);
  process.exit(0);
});
