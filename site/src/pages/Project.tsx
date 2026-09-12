import { Link, useParams } from 'react-router-dom';
import Topology from '../components/Topology';
import { personByGithub, personByHandle, projectByPath } from '../registry';
import NotFound from './NotFound';

const STATUS_LABEL: Record<string, string> = {
  live: 'live',
  wip: 'in progress',
  archived: 'archived',
  'source-only': 'source only',
};

export default function Project() {
  const { handle, slug } = useParams();
  const project = handle && slug ? projectByPath(handle, slug) : undefined;
  const owner = handle ? personByHandle(handle) : undefined;

  if (!project || !owner) {
    return <NotFound />;
  }

  const host = project.url
    ? project.url.replace('https://', '')
    : `${project.slug}.project-graphite.com`;

  return (
    <article className="pt-[88px] pb-8">
      <p className="m-0 font-mono text-[0.82em] text-faint">
        <Link to={owner.path} className="text-faint hover:text-ink">
          /{owner.handle}
        </Link>
        <span className="mx-1">/</span>
        <span>{project.slug}</span>
      </p>

      <div className="mt-3 flex max-w-[46ch] items-baseline justify-between gap-4">
        <h1 className="m-0 text-[clamp(1.9rem,4.6vw,2.8rem)] leading-[1.1] font-[640] tracking-[-0.036em]">
          {project.name}
        </h1>
        <span
          className="group inline-flex items-center gap-[7px] text-[0.8rem] whitespace-nowrap text-muted"
          data-status={project.status}
        >
          <span className="size-[7px] rounded-full bg-dormant group-data-[status=live]:bg-live group-data-[status=wip]:bg-wip" />
          {STATUS_LABEL[project.status]}
        </span>
      </div>

      <p className="mt-5 mb-0 max-w-[56ch] text-muted">{project.summary}</p>

      <ul className="mt-[18px] flex list-none flex-wrap gap-1.5 p-0 font-mono text-[0.82em]">
        {project.tags.map((tag) => (
          <li key={tag} className="rounded-full border border-line px-2.5 py-0.5 text-faint">
            {tag}
          </li>
        ))}
      </ul>

      <dl className="mt-9 grid grid-cols-[auto_minmax(0,1fr)] gap-x-8 gap-y-3 border-t border-line-soft pt-7 font-mono text-[0.82em]">
        <dt className="text-faint">built by</dt>
        <dd className="m-0">
          {project.authors.map((author, index) => {
            const person = personByGithub(author);
            return (
              <span key={author}>
                {index > 0 && <span className="mx-1.5 text-faint">·</span>}
                {person ? (
                  <Link to={person.path} className="text-ink hover:underline">
                    {person.name}
                  </Link>
                ) : (
                  <a href={`https://github.com/${author}`} className="text-ink hover:underline">
                    {author}
                  </a>
                )}
              </span>
            );
          })}
        </dd>

        <dt className="text-faint">listed under</dt>
        <dd className="m-0">
          <Link to={owner.path} className="text-ink hover:underline">
            {owner.name}
          </Link>
        </dd>

        {project.url && (
          <>
            <dt className="text-faint">running at</dt>
            <dd className="m-0">
              <a href={project.url} className="text-ink hover:underline">
                {host} ↗
              </a>
            </dd>
          </>
        )}

        <dt className="text-faint">source</dt>
        <dd className="m-0">
          <a href={project.repoUrl} className="text-ink hover:underline">
            {project.repo} ↗
          </a>
        </dd>
      </dl>

      {project.topology && (
        <section className="mt-12 border-t border-line-soft pt-10">
          <h2 className="m-0 mb-6 font-mono text-[0.82em] font-normal text-faint">
            what is deployed
          </h2>
          <div className="max-w-[34rem]">
            <Topology topology={project.topology} host={host} />
          </div>
        </section>
      )}
    </article>
  );
}
