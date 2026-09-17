import { Link, useParams } from 'react-router-dom';
import ProjectCard from '../components/ProjectCard';
import Section from '../components/Section';
import Status from '../components/Status';
import TagList from '../components/TagList';
import {
  childProjects,
  personByGithub,
  personByHandle,
  projectByRoute,
  projectBySlug,
} from '../registry';
import NotFound from './NotFound';

export default function Project() {
  const { parentSlug, slug } = useParams();
  const project = slug ? projectByRoute(parentSlug, slug) : undefined;
  const owner = project ? personByHandle(project.owner) : undefined;
  const parent = project?.parent ? projectBySlug(project.parent) : undefined;
  const children = project ? childProjects(project.slug) : [];

  if (!project || !owner) {
    return <NotFound />;
  }

  return (
    <article>
      <section className="pt-[88px] pb-5">
        <p className="mono-sm m-0 text-faint">
          <span>
            /projects/
            {parent && (
              <>
                <Link to={parent.path} className="text-faint hover:text-ink hover:underline">
                  {parent.slug}
                </Link>
                /
              </>
            )}
            {project.slug}
          </span>
        </p>

        <div className="mt-3 flex max-w-[52ch] items-baseline justify-between gap-4">
          <h1 className="page-title">{project.name}</h1>
          <Status status={project.status} />
        </div>

        <p className="mt-6 mb-0 max-w-[56ch] text-muted">{project.summary}</p>

        <TagList tags={project.tags} className="mt-[18px]" />
      </section>

      {project.showcase && (
        <Section label="case study">
          <div className="grid gap-7 md:grid-cols-3">
            <div>
              <h3 className="mono-sm m-0 mb-2 font-normal text-faint">problem</h3>
              <p className="m-0 text-muted">{project.showcase.problem}</p>
            </div>
            <div>
              <h3 className="mono-sm m-0 mb-2 font-normal text-faint">approach</h3>
              <p className="m-0 text-muted">{project.showcase.approach}</p>
            </div>
            <div>
              <h3 className="mono-sm m-0 mb-2 font-normal text-faint">outcome</h3>
              <p className="m-0 text-muted">{project.showcase.outcome}</p>
            </div>
          </div>
        </Section>
      )}

      {children.length > 0 && (
        <Section label="projects">
          <div>
            {children.map((child) => (
              <ProjectCard key={child.path} project={child} />
            ))}
          </div>
        </Section>
      )}

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

      {project.showcase && (
        <Section label="contributions">
          <div className="grid gap-5">
            {project.showcase.contributions.map((contribution) => {
              const person = personByGithub(contribution.github);
              return (
                <article key={contribution.github} className="max-w-[56ch]">
                  <h3 className="m-0 text-base font-semibold">
                    {person ? (
                      <Link to={person.path} className="text-ink hover:underline">
                        {person.name}
                      </Link>
                    ) : (
                      <a
                        href={`https://github.com/${contribution.github}`}
                        className="text-ink hover:underline"
                      >
                        {contribution.github}
                      </a>
                    )}
                  </h3>
                  <p className="mt-2 mb-0 text-muted">{contribution.summary}</p>
                </article>
              );
            })}
          </div>
        </Section>
      )}
    </article>
  );
}
