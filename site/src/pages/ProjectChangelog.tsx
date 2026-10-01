import { Link, useParams } from 'react-router';
import Status from '../components/Status';
import TagList from '../components/TagList';
import Timeline from '../components/Timeline';
import {
  changelogPath,
  childProjects,
  memberByHandle,
  projectByRoute,
  projectBySlug,
  releasesForProject,
} from '../registry';
import NotFound from './NotFound';

export default function ProjectChangelog() {
  const { parentSlug, slug } = useParams();
  const project = slug ? projectByRoute(parentSlug, slug) : undefined;

  if (!project) {
    return <NotFound />;
  }

  const owner = memberByHandle(project.owner)!;
  const epic = project.parent ? projectBySlug(project.parent) : undefined;
  const children = childProjects(project.slug);

  return (
    <>
      <section className="pt-22 pb-5">
        <p className="mono-sm m-0 text-faint">
          /changelog/{project.path.split('/')[1]}/
          {epic && (
            <>
              <Link
                to={changelogPath(epic)}
                className="text-faint transition-colors duration-200 hover:text-ink hover:underline"
              >
                {epic.slug}
              </Link>
              /
            </>
          )}
          {project.slug}
        </p>

        <div className="mt-3 flex max-w-[52ch] items-baseline justify-between gap-4">
          <h1 className="page-title">{project.name}</h1>
          <Status status={project.status} />
        </div>

        <p className="mt-6 mb-0 max-w-[56ch] text-muted">{project.summary}</p>

        <TagList tags={project.tags} className="mt-4.5" />

        <dl className="mono-sm mt-8 grid grid-cols-[auto_minmax(0,1fr)] gap-x-8 gap-y-3">
          {epic && (
            <>
              <dt className="text-faint">epic</dt>
              <dd className="m-0">
                <Link to={changelogPath(epic)} className="text-ink hover:underline">
                  {epic.name}
                </Link>
              </dd>
            </>
          )}

          {children.length > 0 && (
            <>
              <dt className="text-faint">projects</dt>
              <dd className="m-0">
                {children.map((child, index) => (
                  <span key={child.path}>
                    {index > 0 && <span className="mx-1.5 text-faint">·</span>}
                    <Link to={changelogPath(child)} className="text-ink hover:underline">
                      {child.name}
                    </Link>
                  </span>
                ))}
              </dd>
            </>
          )}

          <dt className="text-faint">owner</dt>
          <dd className="m-0">
            <Link to={changelogPath(owner)} className="text-ink hover:underline">
              {owner.name}
            </Link>
          </dd>

          <dt className="text-faint">source</dt>
          <dd className="m-0">
            <a href={project.repoUrl} className="text-ink hover:underline">
              {project.repo} ↗
            </a>
          </dd>

          <dt className="text-faint">project page</dt>
          <dd className="m-0">
            <Link to={project.path} className="text-ink hover:underline">
              {project.path}
            </Link>
          </dd>
        </dl>
      </section>

      <Timeline releases={releasesForProject(project)} showProject={children.length > 0} />
    </>
  );
}
