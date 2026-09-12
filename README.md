# portfolio

The site at [project-graphite.com](https://project-graphite.com). Astro, static, deployed to
Cloudflare Pages.

## What makes it different

Each project card carries a diagram of what is **actually deployed** — the services, the routes
they answer on, their ports, and the database they share. None of it is drawn by hand. It is
generated at build time from the same registry entry that creates the deployment, so a card cannot
drift from reality: change the deployment and the diagram changes with it.

A service with no public route is drawn with a dashed outline, because that is what it is.

## Where the data comes from

`site/src/data/projects.json` is **generated, not edited.** The `platform` repository compiles it
from `projects/*.yml` and commits it here whenever the registry changes, which triggers a rebuild.

To add or change a project, edit its registry entry in `platform`. Editing this file directly will
be overwritten on the next sync.

## Running it

```sh
cd site
npm install
npm run dev
```

To preview against real topology, copy a compiled `projects.json` over `site/src/data/`:

```sh
python ../platform/scripts/compile.py site/src/data/projects.json
```

## Layout

| Path | What it is |
| :--- | :--- |
| `site/src/components/Topology.astro` | The SVG diagram. Computes its own geometry from the service list. |
| `site/src/components/ProjectCard.astro` | One project row |
| `site/src/pages/index.astro` | The index |
| `site/src/types.ts` | Shape of a compiled registry entry |
| `site/src/styles/global.css` | Palette and shell. Light and dark are both defined here. |

## Deployment

Cloudflare Pages, configured to match the registry entry in `platform`:

| Setting | Value |
| :--- | :--- |
| Root directory | `site` |
| Build command | `npm run build` |
| Output directory | `dist` |

## Not built yet

Per-project detail pages. The registry holds a one-line summary and nothing longer, so a detail
page would be a thin wrapper around text already on the card. They are worth adding once there are
write-ups to put on them.
