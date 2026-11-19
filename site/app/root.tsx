import { useContext, type ReactNode } from 'react';
import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from 'react-router';
import type { Route } from './+types/root';
import NotFound from './components/NotFound';
import Shell from './components/Shell';
import { hubContext, NonceContext } from './context';
import { shouldRevalidateRoot, useLive } from './live';
import { absolute, broken, metaFor, metaTags, notFound } from './meta';
import { createModel } from './model';
import { publicSettings } from './settings';
import { shareCard, sharePath } from './share';
import { structuredData } from './structured-data';
import { ROOT_TOPICS, type LiveHandle } from './topics';
import './styles/global.css';

export const handle: LiveHandle = { topics: ROOT_TOPICS };

export const shouldRevalidate = shouldRevalidateRoot;

export function loader({ context }: Route.LoaderArgs) {
  const { directory, settings, viewer, csrf, presence, views } = context.get(hubContext);
  return {
    directory,
    settings: publicSettings(settings),
    viewer,
    csrf,
    presence: presence.current(),
    views: views.totals(),
  };
}

export const links: Route.LinksFunction = () => [
  { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
  { rel: 'manifest', href: '/manifest.webmanifest' },
  { rel: 'alternate', type: 'application/rss+xml', title: 'RSS', href: '/blog/feed.xml' },
  { rel: 'alternate', type: 'application/atom+xml', title: 'Atom', href: '/blog/atom.xml' },
];

export function meta({ loaderData, location, error }: Route.MetaArgs) {
  const path = location.pathname.replace(/(.)\/$/, '$1');
  if (isRouteErrorResponse(error) && error.status === 404) {
    return metaTags(notFound(path), undefined);
  }
  if (error || !loaderData) {
    return metaTags(broken(path), undefined);
  }
  const model = createModel(loaderData.directory);
  const page = metaFor(model, path, loaderData.settings['home.hero.headline']);
  const card = page.noindex
    ? undefined
    : shareCard(
        model,
        path,
        loaderData.settings['home.hero.headline'],
        loaderData.settings['site.accents'],
      );
  const image = card && { path: sharePath(path, card), alt: `${card.title}. ${card.subtitle}` };
  const data = structuredData(model, page, image && absolute(image.path));
  return [...metaTags(page, image), ...(data ? [{ 'script:ld+json': data }] : [])];
}

export function Layout({ children }: { children: ReactNode }) {
  const nonce = useContext(NonceContext);
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link
          rel="preload"
          href="/fonts/hanken-grotesk-v12-latin.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        <meta name="theme-color" content="#0c0c0e" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration nonce={nonce} />
        <Scripts nonce={nonce} />
      </body>
    </html>
  );
}

export default function App() {
  useLive();
  return (
    <Shell>
      <Outlet />
    </Shell>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  return (
    <Shell>
      {isRouteErrorResponse(error) && error.status === 404 ? (
        <NotFound />
      ) : (
        <section className="hero gate">
          <div>
            <h1>Something broke.</h1>
            <p className="lede">
              The page could not be rendered. It has been recorded; try again in a moment.
            </p>
          </div>
        </section>
      )}
    </Shell>
  );
}
