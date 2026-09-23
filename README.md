# Graphite Hub

The site at [project-graphite.com](https://project-graphite.com). React, Vite, TypeScript and
Tailwind, prerendered to static HTML and deployed to Cloudflare Pages.

People, projects and deployment state come from the same validated registry. A project only gets a
live link when that registry says it is live; source-only and in-progress work are labelled as such.
Member pages include every project they maintain or are credited on, including collaborative work.

## Routes

| Path | What it is |
| :--- | :--- |
| `/` | Latest members, epics and projects |
| `/members` | Every member |
| `/members/<handle>` | A member: who they are, and the projects they maintain or built |
| `/epics` | Every epic |
| `/epics/<slug>` | An epic and the projects inside it |
| `/epics/<epic>/<slug>` | A project inside an epic |
| `/projects` | Every standalone project |
| `/projects/<slug>` | A standalone project: what it is, who built it, and where it runs |

The old short routes redirect permanently, so existing links continue to work. A deployed project
runs at its own subdomain and its project page links to it — serving an app under a path would mean
every project had to be built knowing where it was mounted.

## Prerendering

`npm run build` refreshes `src/data/github.json` (`scripts/fetch-github.mjs`), type-checks, builds
the client and SSR bundles, then runs `scripts/prerender.mjs`, which renders every known route to a
real `index.html` on disk.

On a static host, prerendering means:

- `/members/amrmscll/` resolves to a real file, so deep links work without SPA-fallback rewrites
- unknown paths still miss and get `404.html` with a real 404 status, rather than a soft 200
- each route gets its own `<title>`, description, canonical and Open Graph tags
- the HTML contains the actual content, so anything that does not run JavaScript still sees it

Routes come from `routePaths` in `src/registry.ts`, derived from the registry. A new project or
person is a new page automatically.

## Where the data comes from

`site/src/data/registry.json` is **generated, not edited.** The `platform` repository compiles it
from `projects/*.yml` and `people/*.yml` and commits it here whenever the registry changes, which
triggers a rebuild.

To add or change a project, edit the `.graphite.yml` in its repository; `platform` syncs it and
compiles this file. Editing this file directly will be overwritten on the next sync. It is in
`.prettierignore` for the same reason — its formatting belongs to the compiler.

## Running it

```sh
cd site
npm install
npm run dev
```

To preview against real topology rather than the committed data:

```sh
python ../../platform/scripts/compile.py src/data/registry.json
```

## Layout

| Path | What it is |
| :--- | :--- |
| `site/src/components/ProjectCard.tsx` | One project card |
| `site/src/pages/` | Index, members, member, epics, projects, project and not-found pages |
| `site/src/registry.ts` | Typed access to the compiled registry, and the route list |
| `site/src/meta.ts` | Per-route title, description and canonical |
| `site/src/entry-server.tsx` | Render entry used by prerendering |
| `site/scripts/prerender.mjs` | Writes one HTML file per route |
| `site/public/_headers` | Security and immutable-asset cache headers |
| `site/src/types.ts` | Shape of a compiled registry entry |
| `site/src/styles/global.css` | Palette and shell (dark only) |

Styling is Tailwind utilities in the markup. The palette is declared once as an `@theme` block in
`global.css`, which generates both the CSS custom properties and the matching utilities — so
`bg-paper` and `text-muted` read the same tokens.

## Commands

| Command | What it does |
| :--- | :--- |
| `npm run dev` | Dev server |
| `npm run build` | Refresh GitHub profiles, type-check, build and prerender to `dist/` |
| `npm run lint` | ESLint |
| `npm run format:check` | Prettier |

## Deployment

Cloudflare Pages, matching the registry entry in `platform`:

| Setting | Value |
| :--- | :--- |
| Root directory | `site` |
| Build command | `npm run build` |
| Output directory | `dist` |
| `NODE_VERSION` | `24` |

Every push to `main` deploys. Every pull request gets its own preview URL.

## Not built yet

Screenshots and per-project social images. See the docs repository's `recommendations.md` for the
remaining product and hosting backlog.
