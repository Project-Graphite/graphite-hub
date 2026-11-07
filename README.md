# Graphite Hub

The site at [project-graphite.com](https://project-graphite.com): members, projects, epics,
releases, writing, and what is running right now. One Node 24 process in `site/`: React Router 8
in framework mode (loaders, actions, server rendering) on Express 5, SQLite through `node:sqlite`
for everything durable, Redis for everything ephemeral, a Server-Sent Events stream for live
updates and a Hocuspocus WebSocket for co-editing. It runs as a compose project on the VPS behind
Traefik, with the apex proxied through Cloudflare.

`CLAUDE.md` holds the decision records and the working rules for this repository.

## What it does

| Area | What |
| :--- | :--- |
| Directory | members from the GitHub organisation; projects and epics from `platform/projects/*.yml`, validated with platform's `schema/project.schema.json` through `ajv` |
| Profiles | a member edits their page at `/<alias>/edit`: ordered blocks (bio, projects, stack, github, releases, links, short links, writing, gallery, text, quote, embed), alias, accent, avatar and cover; every save is a version with undo and history |
| Projects | presentation (cover, accent, summary override, layout, feature slot) lives here; registry fields (name, summary, tags, status, pinned, listed) are committed back to the repository's `.graphite.yml` through the platform GitHub App, or proposed as a pull request where `main` refuses the commit, and shown as pending until the sync confirms them |
| Blog | a TipTap 3 editor with co-editing over Yjs and Hocuspocus, offline drafts, versions, templates and trash; scheduled publishing; RSS and Atom feeds; a published post renders from stored HTML with no editor code |
| Subscribe | email subscriptions to everything, one project or one member, per post or as a weekly digest, sent through SMTP with signed confirm, manage and unsubscribe links |
| Live | every page subscribes to topics over `/live`; presence, reading counters, the editing badge, view counters and the visitor map patch in place, everything else revalidates its loader |
| Changelog | every project was recorded at 1.0.0 when the changelog started fresh; releases come from GitHub Releases since |
| Status | rollout reports from the VPS, a 30-second probe of every live host, 30-day uptime, the public console and the visitor map |
| Messages | the wall from Message Lab, folded in: public or private messages, moderated by members |
| Admin | `/admin`, owners only: every setting with history and revert, a live preview, the errors panel, subscribers and email templates with a test send, members, sign everyone out |

## Routes

| Path | What it is |
| :--- | :--- |
| `/` | The home page: counters, activity line, release timeline, featured projects, members, writing |
| `/members`, `/members/<handle>` | Every member; one member |
| `/<alias>`, `/<alias>/blog`, `/<alias>/blog/<slug>`, `/<alias>/go/<name>`, `/<alias>/edit` | A member by the alias they chose, their posts, one post, a short link, the editor |
| `/projects`, `/epics` | Every standalone project; every epic |
| `/<slug>`, `/<epic>/<slug>`, `/<alias>/<slug>` | A project, a project inside an epic, a project under a member's address with `rel=canonical` to `/<slug>` |
| `/blog`, `/blog/feed.xml`, `/blog/atom.xml` | Every published post with filters; the feeds |
| `/blog/new`, `/blog/mine`, `/blog/<id>/edit` | Members: templates, your posts, the editor |
| `/changelog`, `/changelog/members/<handle>`, `/changelog/projects/<slug>`, `/changelog/epics/<slug>`, `/changelog/epics/<epic>/<slug>` | Releases, newest first |
| `/status`, `/messages`, `/search`, `/subscribe`, `/privacy`, `/sign-in` | Small pages on the same frame |
| `/subscribe/<purpose>/<id>/<sig>` | Signed confirm, manage and unsubscribe links |
| `/admin` | Owners only |
| `/sitemap.xml`, `/llms.txt`, `/share/*` | Sitemap, a plain-text index, generated 1200 by 630 share images |

Project slugs and member aliases share the root namespace; a slug wins, and an alias equal to a
slug or a top-level route is refused in the editor. `/projects/<slug>` and `/epics/...` redirect
permanently. `/kit`, the preview of every kit piece, answers 404 in production.

## Server endpoints

| Endpoint | What |
| :--- | :--- |
| `GET /health/live`, `GET /health/ready` | Liveness; readiness only when SQLite answers, Redis answers `PING` and the snapshot builds. Compose and Traefik use ready |
| `GET /live?topics=a,b` | The SSE stream: at most 12 topics per tab, replay from `Last-Event-ID`, a heartbeat every 25 s, bursts coalesced to one frame per topic per 100 ms. Private events reach members only |
| `/collab` | The Hocuspocus WebSocket, authenticated with the session cookie and its CSRF token |
| `/auth/sign-in`, `/auth/callback`, `POST /auth/sign-out` | GitHub OAuth with `read:org` |
| `POST /internal/github` | The organisation webhook, verified with `X-Hub-Signature-256` and `GITHUB_WEBHOOK_SECRET`; a delivery id is processed once and answered 202, a repeat 200, anything else 404 |
| `POST /internal/deploys`, `GET /internal/metrics` | Signed with `DEPLOY_REPORT_SECRET` (HMAC over `timestamp.body`), accepted only from the host, never through the edge |
| `POST /views/<kind>/<key>` | A view report from a page that was visible for 10 s and scrolled a quarter; counted once per visitor per item per day through a hashed id that is never stored |
| `GET /uploads/<id>/<width>.webp` | Images from the `sharp` pipeline, immutable |
| `GET /admin/email?kind=` | The email preview an owner sees on `/admin` |

The webhook drives the sync: a push to `platform` under `projects/` or `schema/` rereads the
registry; a push that changes a repository's `.graphite.yml` dispatches platform's **Sync
registry**; `release` records the release; `star`, `fork` and `repository` refresh that
repository's numbers; `member`, `membership` and `organization` resync members and revoke a removed
member's sessions. A full sync runs every hour as the fallback.

## Sign-in and roles

Visitors never sign in and never see a sign-in control; every public page renders for anyone with
no cookie. Organisation members open the account menu with `?graphite` on any page and sign in with
GitHub; membership of the organisation is required, and an organisation admin is the owner. A
session is an opaque id in an `HttpOnly`, `SameSite=Lax` cookie pointing at a Redis entry kept 7
days and refreshed on use; membership is rechecked with GitHub at most once a minute, and a removed
member is out within a second. Actions carry a CSRF token and an Origin check. Member routes answer
404 to anyone else.

| A member | The owner |
| :--- | :--- |
| edits their own page and the projects they own; writes, publishes, schedules and trashes their own posts; edits posts they are named on; moderates messages | edits any page, project or post; `/admin`; signs everyone out |

## Storage

SQLite at `DATA_DIR/hub.db`, migrated from `server/migrations/` on start, holds members, profiles,
projects, presentation, releases, deploys, uptime, posts, versions, uploads, activity, views,
subscribers, sends, jobs, messages, short links, settings, errors and webhook deliveries. Uploads
live under `DATA_DIR/uploads`. The volume is in the nightly backup.

Redis is append-only with `noeviction`, so a full Redis fails a write loudly instead of dropping a
session: the event bus and the `events` stream (7 days, the stream id is the SSE event id),
sessions, presence sorted sets, view HyperLogLogs, the visitor map and every rate limit, each with
a TTL. Nothing lives only in Redis: scheduled publishing, emails and the digest are `jobs` and
`sends` rows in SQLite driven by a timer, so losing Redis delays nothing durable.

## Background work

| Job | When |
| :--- | :--- |
| Full sync: registry, members, repository stats, releases, uptime summary | every hour |
| Uptime probe of every live host | every 30 s |
| Cloudflare address ranges, which decide when `CF-Connecting-IP` and `CF-IPCountry` are trusted | daily |
| Lifecycle: uptime rolled up to days after 30 days, activity 180 days (deploys and releases kept), errors 30 days, webhook deliveries 7 days, versions 90 days or the last 50 per key, trashed posts 30 days, unconfirmed subscribers 7 days, unsubscribed 30 days, sends 90 days, the Redis stream 7 days | nightly at 03:30 UTC |
| Due jobs: scheduled publishes, the email queue within `email.hourly`, the weekly digest | a timer armed to the next due row |

## Observability

One JSON line per request through `pino` with a request id, returned as `X-Request-Id`; never a
query string, body, token or email. Every unhandled error is fingerprinted by message and top frame
and upserted into `errors`; the first of a new fingerprint emails `ALERTS_EMAIL`, at most once a
day per fingerprint; `/admin` lists them live with resolve. `/internal/metrics` gives the console
the error rate, p95 and live connections for its Alerts page.

## Configuration

| Variable | Value |
| :--- | :--- |
| `APP_URL` | the public origin |
| `REDIS_URL` | Redis, with the password where there is one |
| `SESSION_SECRET` | encrypts the GitHub token inside each session and signs subscriber links; changing it signs everyone out |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | the hub's GitHub OAuth App, callback `<APP_URL>/auth/callback` |
| `PLATFORM_APP_CLIENT_ID`, `PLATFORM_APP_PRIVATE_KEY` | the platform GitHub App, for reading the registry, members and releases and for write-back |
| `GITHUB_WEBHOOK_SECRET` | the organisation webhook's secret |
| `DEPLOY_REPORT_SECRET` | shared with the deploy agent and the console |
| `SMTP_URL`, `ALERTS_FROM`, `ALERTS_EMAIL` | the SMTP transport, the sending address, the owner's address for error alerts and test sends; optional, email is off without them |
| `DATA_DIR`, `PORT` | `/data` in the image, `3000` |
| `DEV_LOGIN`, `DEV_ROLE`, `GITHUB_TOKEN` | development only: sign in as that login without OAuth, `member` for a member's view, a token for real GitHub data |

Production values are entered in the console's secret store under `/graphite-hub/` and reach the
container through `/etc/graphite/graphite-hub.env` on the VPS. The organisation webhook points at
`https://project-graphite.com/internal/github` with push, release, star, fork, member, membership,
organization and repository events.

## Running it

```sh
cd site
DEV_LOGIN=<your GitHub login> docker compose up
```

That runs the dev server with hot reload and a local Redis on http://localhost:3000. Without
Docker, start a Redis on 6379, put `APP_URL=http://localhost:3000`, `REDIS_URL=redis://localhost:6379`,
`SESSION_SECRET=anything` and `DEV_LOGIN` in `site/.env`, and run `npm run dev`. Add `GITHUB_TOKEN`
to read the real registry, members and releases.

## Commands

| Command | What it does |
| :--- | :--- |
| `npm run dev` | The server with Vite in middleware mode |
| `npm run build` | Build the client and server bundles to `build/` |
| `npm start` | The production server from `build/` |
| `npm run typecheck` | Route type generation and `tsc` |
| `npm run lint`, `npm run format:check` | ESLint, Prettier |
| `npm test` | Node's test runner over `server/**/*.test.ts` and `scripts/*.test.mjs` |
| `npm run size` | Compressed JavaScript per route against the 150 KB budget |
| `npm run sync:releases` | Tag the next version of each listed project from conventional commits (`GH_TOKEN`; `--cut` creates the tags, `--repo=` limits to one repository). The `Changelog` workflow in `actions` runs it |

## Layout

| Path | What it is |
| :--- | :--- |
| `app/routes.ts`, `app/routes/` | The route table and one module per route, each declaring its live topics |
| `app/topics.ts` | The topic catalogue, which topics patch in place, and every route's subscription |
| `app/settings.ts` | Every site setting with its default and validator; `/admin` edits them |
| `app/components/kit/` | The hub's own kit: frame, page header, rail panels, cards, windows, members, releases, posts, the map |
| `app/motion/` | Every motion piece behind `site.motion` and `prefers-reduced-motion` |
| `app/editor/` | The post editor, loaded lazily |
| `app/styles/graphite.css`, `app/styles/pages/` | Tokens, then one sheet per page group |
| `server/main.ts`, `server/app.ts` | Process start and timers; the Express app, security headers, internal routes and the React Router handler |
| `server/*.ts` | One module per concern: auth, sessions, bus, live, presence, views, registry, writeback, sync, readers, changelog, deploys, uptime, profiles, presentation, uploads, posts, collab, feeds, subscribers, sends, digest, emails, mail, settings, admin, errors, lifecycle, snapshot, share |
| `server/migrations/` | Numbered SQL, applied on start |
| `server/console/public.ts` | `toPublicEvent`: the only projection of events onto the public console |
| `scripts/` | The bundle size check, the release rules and the release sync |
| `Dockerfile`, `compose.yaml` | The production image; the local stack |

## Deployment

`pipeline.yml` calls the shared pipeline: on a pull request it runs the checks and a build; on
`main` it publishes `ghcr.io/project-graphite/graphite-hub/site:sha-<short>` and writes
`IMAGE_TAG=sha-<short>` into `platform/deploy/graphite-hub/values`, and platform's **Deploy**
rolls it out through the deploy agent. Two more jobs run on every push: types, format and the
bundle budget, and a start of the built image against a Redis until `/health/ready` answers.

The compose project is `platform/deploy/graphite-hub/`: the app with a 1024M limit and 1.5 CPUs,
Redis with 96 MB and `noeviction`, the `data` volume in the nightly backup, the apex proxied through
Cloudflare. A release recreates the one container, so the apex answers errors for the seconds the
new one takes to become ready. Rollback is editing `IMAGE_TAG` back.
