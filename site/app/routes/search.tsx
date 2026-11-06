import { useEffect, useMemo, useState } from 'react';
import { Form, Link, useNavigate } from 'react-router';
import type { Route } from './+types/search';
import { Avatar } from '../components/kit/basics';
import { Chips, hitKeys, HitRow } from '../components/kit/directory';
import { Fact, PageHeader } from '../components/kit/page';
import Status from '../components/Status';
import { Page } from '../components/Shell';
import { hubContext } from '../context';
import { day } from '../format';
import { useHub, useRoot } from '../hub';
import { changelogPath } from '../model';
import { search, type Hit } from '../search';

const KINDS: Hit['kind'][] = ['member', 'project', 'release'];

export function loader({ context, request }: Route.LoaderArgs) {
  const query = new URL(request.url).searchParams.get('q') ?? '';
  return { query, hits: search(context.get(hubContext).directory, query, 60) };
}

function Browse() {
  const hub = useHub();
  return (
    <div className="browse">
      <div>
        <h2>members</h2>
        {hub.members.map((member) => (
          <Link key={member.handle} to={member.path}>
            <Avatar member={member} size="sm" />
            <span className="text">
              <strong>{member.name}</strong>
              <small>{member.headline ?? `@${member.github}`}</small>
            </span>
          </Link>
        ))}
      </div>
      <div>
        <h2>projects</h2>
        {hub.projects.map((project) => (
          <Link key={project.path} to={project.path}>
            <span className="text">
              <strong>{project.name}</strong>
              <small>
                {project.parent
                  ? `inside ${hub.projectBySlug(project.parent)?.name}`
                  : project.kind}
              </small>
            </span>
            <Status status={project.status} />
          </Link>
        ))}
      </div>
      <div>
        <h2>releases</h2>
        {hub.releases.slice(0, 8).map((release) => {
          const project = hub.projectBySlug(release.project);
          return (
            <Link
              key={release.id}
              to={project ? `${changelogPath(project)}#${release.id}` : '/changelog'}
            >
              <span className="text">
                <strong>
                  {project?.name ?? release.project} v{release.version}
                </strong>
                <small>
                  {release.title ?? release.summary ?? release.groups[0]?.changes[0]?.text}
                </small>
              </span>
              <time dateTime={release.date}>{day(release.date)}</time>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export default function Search({ loaderData }: Route.ComponentProps) {
  const directory = useRoot()!.directory;
  const hub = useHub();
  const navigate = useNavigate();
  const [query, setQuery] = useState(loaderData.query);
  const [kind, setKind] = useState('all');
  const [active, setActive] = useState(-1);
  const hits = useMemo(
    () => (query === loaderData.query ? loaderData.hits : search(directory, query, 60)),
    [directory, query, loaderData],
  );
  const shown = hits.filter((hit) => kind === 'all' || hit.kind === kind);
  const counts = KINDS.map((id) => ({
    id,
    label: `${id}s`,
    count: hits.filter((hit) => hit.kind === id).length,
  })).filter((choice) => choice.count > 0);

  useEffect(() => {
    const url = query.trim() ? `/search?q=${encodeURIComponent(query.trim())}` : '/search';
    if (location.pathname + location.search !== url) {
      history.replaceState(history.state, '', url);
    }
  }, [query]);

  return (
    <Page>
      <PageHeader
        path="/search"
        title="Search"
        actions={
          <Form method="get" className="search-box" onSubmit={(event) => event.preventDefault()}>
            <input
              name="q"
              value={query}
              autoFocus
              autoComplete="off"
              aria-label="Search"
              onChange={(event) => {
                setQuery(event.target.value);
                setActive(-1);
                setKind('all');
              }}
              onKeyDown={hitKeys(shown.length, active, setActive, () =>
                navigate(shown[Math.max(active, 0)].to),
              )}
            />
            {query && (
              <button type="button" aria-label="Clear" onClick={() => setQuery('')}>
                ×
              </button>
            )}
          </Form>
        }
        facts={
          query.trim() ? (
            <Fact value={hits.length} label={hits.length === 1 ? 'match' : 'matches'} />
          ) : (
            <>
              <Fact value={hub.members.length} label="members" />
              <Fact value={hub.rootProjects.length} label="projects" />
              <Fact value={hub.epics.length} label={hub.epics.length === 1 ? 'epic' : 'epics'} />
              <Fact value={hub.releases.length} label="releases" />
            </>
          )
        }
      >
        {counts.length > 1 && (
          <div className="dir-tools">
            <Chips
              label="Kind"
              value={kind}
              onChange={(next) => {
                setKind(next);
                setActive(-1);
              }}
              choices={[{ id: 'all', label: 'all', count: hits.length }, ...counts]}
            />
          </div>
        )}
      </PageHeader>
      <section className="band dir">
        {query.trim() ? (
          <div key={`${query}:${kind}`} className="hits">
            {shown.map((hit, index) => (
              <HitRow
                key={`${hit.kind}:${hit.to}`}
                hit={hit}
                needle={query}
                directory={directory}
                active={index === active}
                onHover={() => setActive(index)}
              />
            ))}
            {shown.length === 0 && <p className="none">nothing matches “{query.trim()}”</p>}
          </div>
        ) : (
          <Browse />
        )}
      </section>
    </Page>
  );
}
