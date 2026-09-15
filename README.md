# portfolio

The site at [project-graphite.com](https://project-graphite.com). React, Vite, TypeScript and
Tailwind, prerendered to static HTML and deployed to Cloudflare Pages.

## What makes it different

Each project card carries a diagram of what is **actually deployed** — the services, the routes
they answer on, their ports, and the database they share. None of it is drawn by hand. It is
generated from the same registry entry that creates the deployment, so a card cannot drift from
reality: change the deployment and the diagram changes with it.

A service with no public route is drawn with a dashed outline, because that is what it is.

## Routes

| Path | What it is |
| :--- | :--- |
| `/` | Everything registered |
| `/<handle>` | A person: who they are, and the projects listed under them |
| `/<handle>/<slug>` | A project: what it is, who built it, and what is deployed |

Namespaces come from `owner` in the registry, so `project-graphite.com/amr/windhawk-mods` is the page
*about* Windhawk Mods. A deployed project runs at its own subdomain and the page links to it — serving an app
under a path would mean every project had to be built knowing where it was mounted.

## Prerendering

`npm run build` runs three steps: the client bundle, an SSR bundle, then `scripts/prerender.mjs`,
which renders every known route to a real `index.html` on disk.

This is not an optimisation. It is what makes the site work at all on a static host:

- `/amr/` resolves to a real file, so deep links work without SPA-fallback rewrites
- unknown paths still miss and get `404.html` with a real 404 status, rather than a soft 200
- each route gets its own `<title>`, description, canonical and Open Graph tags
- the HTML contains the actual content, so anything that does not run JavaScript still sees it

Routes come from `routePaths` in `src/registry.ts`, derived from the registry. A new project or
person is a new page automatically.

## Where the data comes from

`site/src/data/registry.json` is **generated, not edited.** The `platform` repository compiles it
from `projects/*.yml` and `people/*.yml` and commits it here whenever the registry changes, which
triggers a rebuild.

To add or change a project, edit its registry entry in `platform`. Editing this file directly will
be overwritten on the next sync. It is in `.prettierignore` for the same reason — its formatting
belongs to the compiler.

## Running it

```sh
cd site
npm install
npm run dev
```

To preview against real topology rather than the committed data:

```sh
python ../platform/scripts/compile.py src/data/registry.json
```

## Layout

| Path | What it is |
| :--- | :--- |
| `site/src/components/Topology.tsx` | The SVG diagram. Computes its own geometry from the service list. |
| `site/src/components/ProjectCard.tsx` | One project row |
| `site/src/pages/` | Index, person, project and not-found pages |
| `site/src/registry.ts` | Typed access to the compiled registry, and the route list |
| `site/src/meta.ts` | Per-route title, description and canonical |
| `site/src/entry-server.tsx` | Render entry used by prerendering |
| `site/scripts/prerender.mjs` | Writes one HTML file per route |
| `site/src/types.ts` | Shape of a compiled registry entry |
| `site/src/styles/global.css` | Palette and shell. Light and dark are both defined here. |

Styling is Tailwind utilities in the markup. The palette is declared once as an `@theme` block in
`global.css`, which generates both the CSS custom properties and the matching utilities — so
`bg-paper`, `text-muted`, `stroke-line` and `fill-surface` all read the same tokens, and the SVG
themes with the layout rather than alongside it.

Light and dark swap by redefining those custom properties under `prefers-color-scheme` and
`[data-theme]`. Every utility follows automatically, so there is not a single `dark:` prefix in the
codebase.

## Commands

| Command | What it does |
| :--- | :--- |
| `npm run dev` | Dev server |
| `npm run build` | Type-check then build to `dist/` |
| `npm run lint` | ESLint |
| `npm run format:check` | Prettier |

## Deployment

Cloudflare Pages, matching the registry entry in `platform`:

| Setting | Value |
| :--- | :--- |
| Root directory | `site` |
| Build command | `npm run build` |
| Output directory | `dist` |
| `NODE_VERSION` | `22` |

Every push to `main` deploys. Every pull request gets its own preview URL.

## Not built yet

Long-form write-ups. Project pages are built entirely from the registry, which holds a summary and
nothing longer. Adding an optional markdown file per project is the natural next step, and needs a
markdown renderer.
