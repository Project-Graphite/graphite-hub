import { renderToString } from 'react-dom/server';
import { StaticRouter } from 'react-router';
import App from './App';
import { metaFor } from './meta';

export { legacyRedirects, routePaths } from './registry';

export function render(path: string) {
  const html = renderToString(
    <StaticRouter location={path}>
      <App />
    </StaticRouter>,
  );

  return { html, meta: metaFor(path) };
}
