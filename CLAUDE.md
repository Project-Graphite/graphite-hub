# Graphite Hub

The site at project-graphite.com: the front of the Project Graphite organisation. Members, projects, epics, releases, writing, and what is running right now. This file is the record of how it is built and why, for anyone working in this repository. The design and the phases are in the workspace plan `.claude/.Plans/as2026-11-04-graphite-hub-server.md`.

The universal rules in the user's global `CLAUDE.md` apply here too. Where this file is more specific, this file wins.

## What the hub is

- A public portfolio with no sign-in wall. Visitors never see a sign-in control; organisation members sign in with `?graphite` on any page.
- One Node monolith on the VPS, one replica, behind Traefik, with the apex proxied through Cloudflare.
- Live on everything: anything on screen that can change on the server changes on screen within a second, on every open tab, without a reload.
- Customisable from the UI: every number, order, list, limit, label and paragraph on a page is a setting the owner changes on `/admin`, live and revertible. Code changes are for new kinds of things, never for different amounts of existing things.

## Decision records

Each entry: the decision, the reason, the date. Add an entry when a decision changes; never edit history.

### 2026-11-04 The hub is a server, not a prerendered site

Reversed "Graphite Hub is prerendered" and "Static work stays off the VPS" in the handbook. A static site could not carry member-edited profiles, a blog written in the browser, or live state. The cost accepted: the apex depends on the VPS, and a hub release causes a gap of seconds.

### 2026-11-04 React Router framework mode on Express

The hub already used React Router; framework mode adds loaders, actions and server rendering without a new framework. Express hosts the SSR handler, the SSE stream and the Hocuspocus WebSocket in one process.

### 2026-11-04 SQLite for everything durable, Redis for everything ephemeral

SQLite through `node:sqlite` on a backed-up volume holds every record. Redis holds the bus, the event stream, the job executor, presence, counters, rate limits, sessions and the page cache, with `noeviction` and append-only persistence. The record of every scheduled job lives in SQLite; Redis only executes. Losing Redis delays work and never loses it. PostgreSQL was not needed by anything planned.

### 2026-11-04 Registry of record stays in platform; the hub reads it and writes back

`platform/projects/<slug>.yml`, written by the sync from each repository's `.graphite.yml`, is the registry. The hub reads it on a webhook, validates with the same JSON schema through `ajv`, and commits UI edits of registry fields back into the project's `.graphite.yml` through the platform GitHub App. Presentation (covers, accents, feature slots, layout) lives only in the hub. One definition of a project, two readers that cannot disagree.

### 2026-11-04 No comments, no mentions, no notification centre

Mentions would have required a notification centre; comments were not wanted for a portfolio. Both can return later as one table and one panel without touching the rest.

### 2026-11-04 Members publish immediately; the owner can override anything

Organisation members are trusted. The organisation owner can edit, unpublish or delete anything, and sign everyone out.

### 2026-11-04 The console is a projection of public events only

The live console on the site shows only rows marked public: deploys by slug and short tag, releases, published posts, sync summaries, uptime summaries. Never a host, path, container, environment name, token, address, or a draft's title. The rule is one function, `toPublicEvent`, with a test asserting every forbidden field is absent. The forbidden-field rule is not a setting.

### 2026-11-04 Secrets live in the console's store, not in git or CI

Values are encrypted in the console's SQLite, edited on its Secrets page, and written to `/etc/graphite/<project>.env` on the host. The deploy payload from CI carries no secrets. In compose, a secret is `${NAME:?}` where it is used; Compose itself enforces presence. The hub's own secrets are entered there like any project's.

### 2026-11-04 Cloudflare proxies the apex

For DDoS absorption, the WAF, caching of covers and share images, and the country header the visitor map needs. SSL stays Full (strict). The hub trusts the client address only from Cloudflare's ranges.

### 2026-11-04 One replica, no staging

A personal portfolio, not a product with a user base. A hub release costs a gap of seconds at the apex; accepted. There is no staging host.

### 2026-11-04 The changelog starts fresh

Every existing project was imported as 1.0.0 on import day. The YAML history in `releases/` was not migrated. The changelog system will be refactored later.

### 2026-11-04 Message Lab folded in as `/messages`

Message Lab's purpose was to prove the deploy path. Its repository is untouched; the hub carries a minimal messages wall with moderation.

### 2026-11-04 Backups verify themselves and can be imported from the console

One shared backup service for every project. Every archive is reopened and checked after it is written, and a failed check raises an alert; the console's Backups page downloads, runs and imports archives. Scheduled restore drills were declined; the built-in verification and the import action are the guarantee instead.

### 2026-11-07 Scheduled work is a SQLite row and a timer; Redis executes nothing

Narrows the storage decision as built. Publishing, email and the digest are `jobs` and `sends` rows driven by a timer armed to the next due row; BullMQ, the Redis queues and the page cache from the plan were not needed and were not built. A Redis loss cannot delay a scheduled publish beyond the next tick.

### 2026-11-07 Releases come from GitHub Releases; Message Lab's entry is archived

The `Changelog` workflow in `actions` tags the next version and publishes a GitHub Release, which the hub records from the organisation webhook; nothing writes release YAML into this repository. Message Lab's `.graphite.yml` is `archived` with `deploy: none`, so the hub stops probing a host that no longer exists; its code stays untouched.

### 2026-11-18 The database is the source of truth; the registry seeds a project once

Reverses "Registry of record stays in platform; the hub reads it and writes back". The hub's database owns everything the site shows about a project: name, summary, tags, status, listed, featured order, showcase, owner, authors, cover, accent, layout and feature. The registry entry fills them the first time a slug is seen and afterwards supplies infrastructure only: slug, repo, parent, kind, deploy, paths and releases. Edits are made on the site through `POST /edit` and are never written to a repository; write-back and the pending overlay are gone. Nothing outside the hub read those content fields, write-back was never exercised in production, and three layers deciding one field gave the editor two summaries. One invariant crosses the boundary: a `live` project whose entry stops deploying becomes `archived`. Removal is soft: a slug absent from a registry listing that validated cleanly, and a member who left the organisation, are marked and hidden, never deleted, and return intact. The platform App needs no write permission on project repositories.

### 2026-11-18 The console reports changes, never steady state

Narrows "The console is a projection of public events only". The hourly uptime summary filled the console with one repeated line, so health is recorded only when it changes: a host that fails two probes in a row, its recovery with the length of the outage, and one digest a day at 00:00 UTC. The console gained the kinds `health`, `star`, `member`, `project`, `wall` and `milestone`, each with its own projection in `toPublicEvent`; the `uptime` kind no longer projects. The reader folds a run of the same line into one with a count, and the activity line shows one line of each kind before it repeats a kind.

### 2026-11-18 Events are delivered in process; Redis keeps the replay stream

Narrows "SQLite for everything durable, Redis for everything ephemeral". With one replica, Redis pub/sub only carried an event from the process back to itself, and a Redis outage left a saved change unseen and reported as failed. `publish` and `record` now hand the event to the listeners in the process; `record` also appends it to the `events` stream, which exists so a reconnecting tab can replay what it missed. A console line is identified by its activity row, not by its stream id, so a line survives a failed append.

### 2026-11-04 Declined

Trending lists, particle cursors, a second replica, a staging host, a threat model document, a dependency pinning bot, an accessibility gate in CI, passkey step-up for revealing secrets, restore drills on a schedule. Each was considered and not wanted now.

## Working rules

### Language and code

- React and Express code is TypeScript under strict mode. Scripts and tooling use whatever fits; do not rewrite a working script into TypeScript for its own sake.
- No code comments. Names and structure carry intent; explanations go in the pull request.
- No redundancy. A value is declared once: defaults in one place, overrides where they differ. If something equals its default, do not write it.
- Inline a value used once. Do not create a variable to explain a value.

### Settings, not constants

Any count, order, label, limit or paragraph that appears on a page is read from `site_settings` with a seeded default and validated on write. A component that hard-codes one of these is a bug.

### Content in the database, infrastructure in the registry

Project content is read through `server/projects.ts` and changed through `server/edit.ts`, which authorises, validates against a schema and keeps a version. The registry sync writes `entry`, `repo` and `synced_at` on a known slug and nothing else. A new editable field is a column the hub owns, never a registry field. Rows that other rows point at are removed softly: `projects.removed_at`, `members.left_at`.

### Live, not polled

Every write publishes to the bus. Every route declares the topics it subscribes to beside its loader. Small frequent things patch in place; larger things revalidate one loader by key. Lists patch by key, and an item under the cursor does not move until the pointer leaves it. Nothing polls.

### Public by default, members by session

Public pages render for anyone with no cookie. Member routes check the session in the loader and return 404 to anyone else. Owner routes use the cached role. Never render a sign-in control without `?graphite`.

### Redis rules

- Every key has a TTL or is explicitly permanent and listed in the plan's Redis table.
- Never store a record only in Redis. If it must survive a restart, it is a SQLite row first.
- `noeviction` stays. A full Redis is a loud failure, not a silent one.

### Design

- Every page uses the frame: left-anchored main column, one 19rem rail on the right, the same hero, section and kit pieces as the home page.
- The hub's own kit lives in `app/components/kit/`. Promote a piece to `@project-graphite/ui` only when a second app wants it.
- All motion sits in `app/motion/` behind `prefers-reduced-motion`. Nothing animates from invisible.
- Tokens come from `app/styles/graphite.css`, which matches the library's palette exactly.

### Security

- Content Security Policy from the one list in `server/index.ts`; a new inline script is a new nonce, never an `'unsafe-inline'`.
- Uploads go through the `sharp` pipeline and only the produced types are served.
- `/internal/*` routes verify their secret, are idempotent, and log only delivery ids.
- Never log a query string, body, token, email or secret. Request ids tie a screenshot to a log line.

### Data lifecycle

Retention is a table in the plan and a nightly `lifecycle` job. A new table or key kind gets a retention line in the same change.

### Observability

Structured logs through `pino` with request ids. Unhandled errors are captured, fingerprinted and stored; the first of a new fingerprint emails the owner. Readiness is separate from liveness; Traefik routes to ready only.

### Tests

Run the spec files that cover the change, never the whole suite. Every route must pass the live audit: fire each topic it subscribes to and assert the DOM changed without navigation. `toPublicEvent` keeps its forbidden-field test. The client bundle has a size budget checked in the PR workflow.

### Pull requests and deploys

- Branches `type/short-summary`; squash merges; the PR title becomes the commit.
- CI publishes a `sha-` image and writes `IMAGE_TAG` into `platform/deploy/graphite-hub/values`. Never deploy a floating tag.
- Secrets are entered in the console. Never put one in this repository, a workflow, or a log.
- Documentation edits need Amr's permission per file.

## Off limits

- The Message Lab repository: its code is untouched; its registry entry is archived with no deploy.
- Comments, mentions, trending, particle cursors, a second replica, staging: do not add them without a new decision record.
- Writing to a project repository from the hub: write-back was removed; the hub reads GitHub and dispatches the platform sync, nothing more.
- Release YAML, a committed registry file or a prerender step: they were removed with the static site; releases come from GitHub Releases and the registry from `platform/projects` at runtime.
- Any address, token or secret value in this file, the README, or the docs: the organisation's repositories are public.
