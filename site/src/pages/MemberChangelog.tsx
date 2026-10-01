import { Link, useParams } from 'react-router';
import Timeline from '../components/Timeline';
import { changelogPath, memberByHandle, projectsOwnedBy, releasesOwnedBy } from '../registry';
import NotFound from './NotFound';

export default function MemberChangelog() {
  const { handle } = useParams();
  const member = handle ? memberByHandle(handle) : undefined;

  if (!member) {
    return <NotFound />;
  }

  const owned = projectsOwnedBy(member);

  return (
    <>
      <section className="pt-22 pb-5">
        <p className="mono-sm m-0 text-faint">/changelog/members/{member.handle}</p>
        <h1 className="page-title mt-3 max-w-[18ch]">{member.name}</h1>
        {member.headline && <p className="mt-2 mb-0 text-muted">{member.headline}</p>}

        <dl className="mono-sm mt-8 grid grid-cols-[auto_minmax(0,1fr)] gap-x-8 gap-y-3">
          <dt className="text-faint">owns</dt>
          <dd className="m-0">
            {owned.length === 0 ? (
              <span className="text-faint">no projects yet</span>
            ) : (
              owned.map((project, index) => (
                <span key={project.path}>
                  {index > 0 && <span className="mx-1.5 text-faint">·</span>}
                  <Link to={changelogPath(project)} className="text-ink hover:underline">
                    {project.name}
                  </Link>
                </span>
              ))
            )}
          </dd>

          <dt className="text-faint">portfolio</dt>
          <dd className="m-0">
            <Link to={member.path} className="text-ink hover:underline">
              {member.path}
            </Link>
          </dd>
        </dl>
      </section>

      <Timeline releases={releasesOwnedBy(member)} showProject />
    </>
  );
}
