import Browse from '../components/Browse';
import { Panel } from '../components/kit/basics';
import { Page } from '../components/Shell';
import { Link } from 'react-router';
import type { Route } from './+types/member-changelog';
import Timeline from '../components/Timeline';
import { found, modelFrom, useHub } from '../hub';
import { changelogPath } from '../model';

export function loader({ context, params }: Route.LoaderArgs) {
  return { handle: found(modelFrom(context).memberByHandle(params.handle)).handle };
}

export default function MemberChangelog({ loaderData }: Route.ComponentProps) {
  const { memberByHandle, projectsOwnedBy, releasesOwnedBy } = useHub();
  const member = memberByHandle(loaderData.handle)!;
  const owned = projectsOwnedBy(member);

  return (
    <Page
      rail={
        <Panel title="browse">
          <Browse />
        </Panel>
      }
    >
      <section className="page-hero">
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
    </Page>
  );
}
