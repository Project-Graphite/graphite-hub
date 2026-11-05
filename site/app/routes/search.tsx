import { Form, Link } from 'react-router';
import type { Route } from './+types/search';
import { Fact, PageHeader } from '../components/kit/page';
import { Page } from '../components/Shell';
import { hubContext } from '../context';
import { search } from '../search';

export function loader({ context, request }: Route.LoaderArgs) {
  const query = new URL(request.url).searchParams.get('q') ?? '';
  return { query, hits: search(context.get(hubContext).directory, query, 50) };
}

export default function Search({ loaderData }: Route.ComponentProps) {
  const { query, hits } = loaderData;
  return (
    <Page>
      <PageHeader
        path="/search"
        title="Search"
        actions={
          <Form method="get" className="flex gap-2">
            <input
              name="q"
              defaultValue={query}
              aria-label="Search"
              placeholder="members, projects, releases"
              className="w-[22ch] max-w-full rounded-md border border-line bg-paper px-3 py-2 text-ink"
            />
            <button type="submit" className="btn">
              search
            </button>
          </Form>
        }
        facts={
          query && <Fact value={hits.length} label={hits.length === 1 ? 'result' : 'results'} />
        }
      />
      {query && (
        <ul className="band grid gap-4">
          {hits.length === 0 && <li className="text-muted">Nothing matches “{query}”.</li>}
          {hits.map((hit) => (
            <li key={`${hit.kind}:${hit.to}`}>
              <Link to={hit.to} className="grid gap-0.5 hover:underline">
                <span className="flex items-baseline gap-3">
                  <strong className="font-semibold">{hit.title}</strong>
                  <span className="mono-sm text-faint">{hit.kind}</span>
                </span>
                <span className="text-sm text-muted">{hit.detail}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}
