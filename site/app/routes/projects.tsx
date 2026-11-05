import type { Route } from './+types/projects';
import { loadRail, PageHero, RAIL_TOPICS, StandardRail } from '../components/kit/page';
import { AccentCard } from '../components/kit/projects';
import { Page } from '../components/Shell';
import { hubContext } from '../context';
import { useHub } from '../hub';
import { PROJECTS } from '../meta';

export const handle = { topics: RAIL_TOPICS };

export function loader({ context }: Route.LoaderArgs) {
  return loadRail(context.get(hubContext));
}

export default function Projects({ loaderData }: Route.ComponentProps) {
  const hub = useHub();
  return (
    <Page rail={<StandardRail {...loaderData} />}>
      <PageHero crumb="/projects" title="Projects">
        <p className="lede">{PROJECTS.description}</p>
      </PageHero>
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
