import type { Route } from './+types/projects';
import { Fact, loadRail, PageHeader, RAIL_TOPICS, StandardRail } from '../components/kit/page';
import { AccentCard } from '../components/kit/projects';
import { Page } from '../components/Shell';
import { hubContext } from '../context';
import { day } from '../format';
import { useHub } from '../hub';

export const handle = { topics: RAIL_TOPICS };

export function loader({ context }: Route.LoaderArgs) {
  return loadRail(context.get(hubContext));
}

export default function Projects({ loaderData }: Route.ComponentProps) {
  const hub = useHub();
  const slugs = new Set(hub.rootProjects.map((project) => project.slug));
  const latest = hub.releases.find((release) => slugs.has(release.project));
  return (
    <Page rail={<StandardRail {...loaderData} />}>
      <PageHeader
        path="/projects"
        title="Projects"
        facts={
          <>
            <Fact value={hub.rootProjects.length} label="projects" />
            <Fact
              value={hub.rootProjects.filter((project) => project.status === 'live').length}
              label="live"
            />
            {latest && <Fact label="last release" value={day(latest.date)} />}
          </>
        }
      />
      <section className="band">
        {hub.rootProjects.length === 0 ? (
          <p className="mono-sm text-faint">Nothing registered yet.</p>
        ) : (
          <div className="band-grid two">
            {hub.rootProjects.map((project) => (
              <AccentCard
                key={project.slug}
                project={project}
                owner={hub.memberByHandle(project.owner)}
              />
            ))}
          </div>
        )}
      </section>
    </Page>
  );
}
