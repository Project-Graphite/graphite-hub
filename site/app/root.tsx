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
import { useLive } from './live';
import { metaFor, metaTags } from './meta';
import { createModel } from './model';
import './styles/global.css';

export const handle = { topics: ['members', 'profiles', 'projects', 'releases'] };

export function loader({ context, request }: Route.LoaderArgs) {
  const { directory, viewer, csrf } = context.get(hubContext);
  return {
    directory,
    viewer,
    csrf,
    signIn: new URL(request.url).searchParams.has('graphite'),
  };
}

export function meta({ loaderData, location }: Route.MetaArgs) {
  return metaTags(metaFor(loaderData && createModel(loaderData.directory), location.pathname));
}

export function Layout({ children }: { children: ReactNode }) {
  const nonce = useContext(NonceContext);
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
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
        <section className="pt-22 pb-5">
          <h1 className="page-title">Something broke.</h1>
          <p className="mt-5.5 mb-0 max-w-[52ch] text-muted">
            The page could not be rendered. It has been recorded; try again in a moment.
          </p>
        </section>
      )}
    </Shell>
  );
}
