import { Link } from 'react-router';
import type { Route } from './+types/status';
import { Console } from '../components/kit/live';
import { PageHero } from '../components/kit/page';
import Section from '../components/Section';
import { Page } from '../components/Shell';
import { hubContext } from '../context';
import { day, shortTag } from '../format';
import { useRoot } from '../hub';

const DAYS = 30;

export const handle = { topics: ['deploys', 'uptime', 'ping', 'releases', 'projects'] };

export function loader({ context }: Route.LoaderArgs) {
  const { reads, directory, settings } = context.get(hubContext);
  return {
    running: reads.running(directory),
    uptime: reads.uptime(DAYS),
    lines: reads.consoleLines(settings['rail.console.lines'] * 3),
  };
}

export default function StatusPage({ loaderData }: Route.ComponentProps) {
  const { running, uptime, lines } = loaderData;
  const limit = useRoot()!.settings['rail.console.lines'] * 3;
  return (
    <Page>
      <PageHero crumb="/status" title="Status">
        <p className="lede">
          Every live project, checked from the hub every thirty seconds, and the public console of
          what just happened.
        </p>
      </PageHero>
      <Section label={`uptime · last ${DAYS} days`}>
        <div className="grid gap-5">
          {running.map((project) => {
            const record = uptime[project.slug];
            return (
              <div key={project.slug} className="grid gap-1.5">
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <Link to={project.path} className="font-semibold hover:underline">
                    {project.name}
                  </Link>
                  <span className="mono-sm text-faint">
                    {record?.p95Ms != null ? `p95 ${record.p95Ms} ms · ` : ''}
                    {project.deploy
                      ? `sha-${shortTag(project.deploy.tag)} · ${day(project.deploy.at)}`
                      : 'no deploy recorded yet'}
                  </span>
                </div>
                <span className="week flex-wrap">
                  {(record?.days ?? Array.from({ length: DAYS }, () => 'none')).map(
                    (state, index) => (
                      <i key={index} className={state === 'none' ? '' : state} />
                    ),
                  )}
                </span>
              </div>
            );
          })}
        </div>
      </Section>
      <Section label="console">
        <Console initial={lines} limit={limit} tall />
      </Section>
    </Page>
  );
}
