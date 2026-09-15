import { Link, useParams } from 'react-router-dom';
import Section from '../components/Section';
import Status from '../components/Status';
import TagList from '../components/TagList';
import { personByGithub, personByHandle, projectBySlug } from '../registry';
import NotFound from './NotFound';

export default function Project() {
  const { slug } = useParams();
  const project = slug ? projectBySlug(slug) : undefined;
  const owner = project ? personByHandle(project.owner) : undefined;

  if (!project || !owner) {
    return <NotFound />;
  }

  return (
    <article>
      <section className="pt-[88px] pb-5">
        <p className="mono-sm m-0 text-faint">
          <span>/projects/{project.slug}</span>
        </p>

        <div className="mt-3 flex max-w-[52ch] items-baseline justify-between gap-4">
          <h1 className="page-title">{project.name}</h1>
          <Status status={project.status} />
        </div>

        <p className="mt-6 mb-0 max-w-[56ch] text-muted">{project.summary}</p>

        <TagList tags={project.tags} className="mt-[18px]" />
      </section>

      <Section label="details">
        <dl className="mono-sm grid grid-cols-[auto_minmax(0,1fr)] gap-x-8 gap-y-3">
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

          <dt className="text-faint">maintained by</dt>
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
                  {project.url.replace('https://', '')} ↗
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
      </Section>
    </article>
  );
}
