# portfolio

The site at [project-graphite.com](https://project-graphite.com). React, Vite, TypeScript and
Tailwind, deployed to Cloudflare Pages.

## What makes it different

Each project card carries a diagram of what is **actually deployed** — the services, the routes
they answer on, their ports, and the database they share. None of it is drawn by hand. It is
generated from the same registry entry that creates the deployment, so a card cannot drift from
reality: change the deployment and the diagram changes with it.

A service with no public route is drawn with a dashed outline, because that is what it is.

## Where the data comes from

`site/src/data/projects.json` is **generated, not edited.** The `platform` repository compiles it
from `projects/*.yml` and commits it here whenever the registry changes, which triggers a rebuild.

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
python ../platform/scripts/compile.py src/data/projects.json
```

## Layout

| Path | What it is |
| :--- | :--- |
| `site/src/components/Topology.tsx` | The SVG diagram. Computes its own geometry from the service list. |
| `site/src/components/ProjectCard.tsx` | One project row |
| `site/src/App.tsx` | Shell and index |
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

Per-project detail pages. The registry holds a one-line summary and nothing longer, so a detail
page would be a thin wrapper around text already on the card. Worth adding once there are write-ups
to put on them — that is the point at which a router earns its place.
