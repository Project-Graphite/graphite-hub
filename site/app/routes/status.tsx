import { useState } from 'react';
import { Link } from 'react-router';
import type { Route } from './+types/status';
import { Console } from '../components/kit/live';
import { Fact, PageHeader } from '../components/kit/page';
import { Page } from '../components/Shell';
import Status from '../components/Status';
import { hubContext } from '../context';
import { day, shortTag } from '../format';
import { useRoot } from '../hub';
import { useLiveMessages } from '../live';
import type { Day } from '../types';

const DAYS = 30;
const DAY_MS = 86_400_000;

export const handle = { topics: ['deploys', 'uptime', 'ping', 'releases', 'projects'] };

export function loader({ context }: Route.LoaderArgs) {
  const { reads, directory, settings } = context.get(hubContext);
  return {
    running: reads.running(directory),
    up: reads.upNow(),
    uptime: reads.uptime(DAYS),
    lines: reads.consoleLines(settings['rail.console.lines'] * 3),
    today: new Date().toISOString().slice(0, 10),
  };
}

function share(days: Day[]) {
  const checked = days.filter((state) => state !== 'none');
  return checked.length === 0
    ? null
    : Math.round((checked.filter((state) => state === 'up').length / checked.length) * 1000) / 10;
}

function Strip({ days, today }: { days: Day[]; today: string }) {
  return (
    <span className="strip" aria-hidden="true">
      {days.map((state, index) => (
        <i
          key={index}
          data-state={state}
          data-label={`${day(new Date(Date.parse(today) - (days.length - 1 - index) * DAY_MS).toISOString())} · ${state === 'none' ? 'no checks' : state}`}
          style={{ animationDelay: `${index * 18}ms` }}
        />
      ))}
    </span>
  );
}

export default function StatusPage({ loaderData }: Route.ComponentProps) {
  const { running, up, uptime, lines, today } = loaderData;
  const limit = useRoot()!.settings['rail.console.lines'] * 3;
  const live = running.filter((project) => up.includes(project.slug)).length;
  const [pinged, setPinged] = useState<Record<string, string>>({});
  useLiveMessages(({ topic, key, id }) => {
    if (topic === 'ping' && key) {
      setPinged((current) => ({ ...current, [key]: id }));
    }
  });

  const lastDeploy = running
    .flatMap((project) => project.deploy?.at ?? [])
    .sort()
    .at(-1);
  const fleet = share(running.flatMap((project) => uptime[project.slug]?.days ?? []));

  return (
    <Page>
      <PageHeader
        path="/status"
        title="Status"
        facts={
          <>
            <Fact value={running.length} label="running" />
            <Fact value={live} label="up right now" />
            {fleet != null && <Fact label={`${DAYS} days`} value={`${fleet}% up`} />}
            <Fact label="checked" value="every 30 s" />
            {lastDeploy && <Fact label="last deploy" value={day(lastDeploy)} />}
          </>
        }
      />
      <section className="board">
        <div className="fleet">
          <div className="head">
            <Status status="live" />
            <span>
              <b>{live}</b> of {running.length} up
            </span>
            <span className="end">last {DAYS} days</span>
          </div>
          {running.map((project) => {
            const record = uptime[project.slug];
            const days = record?.days ?? Array.from({ length: DAYS }, (): Day => 'none');
            const now: Day = up.includes(project.slug)
              ? 'up'
              : days.some((state) => state !== 'none')
                ? 'down'
                : 'none';
            const percent = share(days);
            return (
              <div key={project.slug} className="row" data-state={now}>
                <span className="name">
                  <span className="beat">
                    {pinged[project.slug] && <i key={pinged[project.slug]} />}
                  </span>
                  <Link to={project.path}>{project.name}</Link>
                </span>
                <span className="meta">
                  {record?.p95Ms != null && (
                    <span>
                      p95 <b>{record.p95Ms}</b> ms
                    </span>
                  )}
                  {project.deploy && (
                    <span>
                      sha-{shortTag(project.deploy.tag)} · {day(project.deploy.at)}
                    </span>
                  )}
                  {percent != null && (
                    <span>
                      <b>{percent}</b>% up
                    </span>
                  )}
                </span>
                <Strip days={days} today={today} />
              </div>
            );
          })}
        </div>
        <Console initial={lines} limit={limit} tall />
      </section>
    </Page>
  );
}
