import type { ReactNode } from 'react';
import type { Route } from './+types/home';
import { Band, Button } from '../components/kit/basics';
import { Counters, ReleaseTimeline, Ticker } from '../components/kit/live';
import { Orbit, People } from '../components/kit/members';
import { ChangelogPanel, ConsolePanel, MembersPanel, RunningPanel } from '../components/kit/panels';
import { AccentCard, Window } from '../components/kit/projects';
import { Page } from '../components/Shell';
import { hubContext } from '../context';
import { useHub, useRoot } from '../hub';
import { Field, Mark } from '../motion/canvases';
import { visible } from '../settings';

export const handle = { topics: ['deploys', 'releases', 'projects', 'members', 'stats', 'uptime'] };

export function loader({ context }: Route.LoaderArgs) {
  const { directory, reads, settings } = context.get(hubContext);
  const running = reads.running(directory);
  return {
    running,
    counts: reads.counts(directory, running),
    lines: reads.consoleLines(
      Math.max(settings['rail.console.lines'], settings['home.ticker.count']),
    ),
    today: new Date().toISOString().slice(0, 10),
  };
}

export default function Home({ loaderData }: Route.ComponentProps) {
  const { running, counts, lines, today } = loaderData;
  const settings = useRoot()!.settings;
  const hub = useHub();
  const ownerOf = (owner: string) => hub.memberByHandle(owner);
  const projectsOf = (member: (typeof hub.members)[number]) =>
    hub.projectsForMember(member).length + hub.epicsForMember(member).length;
  const ordered = [...hub.rootProjects].sort(
    (a, b) =>
      Number(b.pinned) - Number(a.pinned) ||
      hub.lastPublishedOn(b).localeCompare(hub.lastPublishedOn(a)) ||
      a.name.localeCompare(b.name),
  );
  const featured = ordered.slice(0, settings['home.featured.count']);
  const more = [...ordered.slice(featured.length), ...hub.epics].slice(
    0,
    settings['home.more.count'],
  );
  const tickerKinds = settings['home.ticker.kinds'];
  const ticker = lines
    .filter((line) => tickerKinds.includes(line.kind))
    .slice(-settings['home.ticker.count'])
    .reverse();

  const sections: Record<string, ReactNode> = {
    hero: (
      <section className="hero">
        <Field />
        <div>
          <p className="mono-sm mb-4 text-faint">{settings['home.hero.eyebrow']}</p>
          <h1>{settings['home.hero.headline']}</h1>
          <p className="lede">{settings['home.hero.paragraph']}</p>
          <div className="actions">
            <Button to="/projects" primary arrow>
              {settings['home.hero.primary']}
            </Button>
            <Button to="https://github.com/project-graphite">github ↗</Button>
          </div>
          <Counters counts={counts} shown={visible(settings['home.counters'])} />
        </div>
        <div className="mark">
          <Mark />
          <em>move through it</em>
        </div>
      </section>
    ),
    ticker: <Ticker lines={ticker} />,
    timeline: (
      <ReleaseTimeline
        releases={hub.releases}
        accentOf={(release) =>
          ownerOf(hub.projectBySlug(release.project)?.owner ?? '')?.accent ?? 'var(--color-muted)'
        }
        nameOf={(release) => hub.projectBySlug(release.project)?.name ?? release.project}
        today={today}
        days={settings['home.timeline.days']}
      />
    ),
    featured: featured.length > 0 && (
      <Band
        title={settings['home.featured.title']}
        description={settings['home.featured.description']}
        more={{ to: '/projects', label: 'explore all projects' }}
      >
        <div className="band-grid">
          {featured.map((project) => (
            <Window key={project.slug} project={project} owner={ownerOf(project.owner)} />
          ))}
        </div>
      </Band>
    ),
    members: (
      <Band
        title={settings['home.members.title']}
        description={settings['home.members.description']}
      >
        <div className="split">
          <People members={hub.members} projectsOf={projectsOf} />
          <Orbit members={hub.members} count={counts.live} label="live right now" />
        </div>
      </Band>
    ),
    writing: null,
    more: more.length > 0 && (
      <Band title={settings['home.more.title']}>
        <div className="band-grid">
          {more.map((project) => (
            <AccentCard key={project.slug} project={project} owner={ownerOf(project.owner)} />
          ))}
        </div>
      </Band>
    ),
  };

  const panels: Record<string, ReactNode> = {
    members: <MembersPanel members={hub.members} projectsOf={projectsOf} />,
    running: <RunningPanel running={running} />,
    console: (
      <ConsolePanel
        lines={lines.slice(-settings['rail.console.lines'])}
        limit={settings['rail.console.lines']}
      />
    ),
    changelog: (
      <ChangelogPanel
        releases={hub.releases.slice(0, settings['rail.changelog.count'])}
        projectOf={(release) => hub.projectBySlug(release.project)}
      />
    ),
  };

  return (
    <Page
      rail={
        visible(settings['home.rail']).length > 0 &&
        visible(settings['home.rail']).map((id) => <div key={id}>{panels[id]}</div>)
      }
    >
      {visible(settings['home.sections']).map((id) => (
        <div key={id}>{sections[id]}</div>
      ))}
    </Page>
  );
}
