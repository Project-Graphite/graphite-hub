import type { ReactNode } from 'react';
import type { Route } from './+types/home';
import { Band, Button } from '../components/kit/basics';
import { Editable } from '../components/kit/Editable';
import { Console, Counters, ReleaseTimeline, Ticker } from '../components/kit/live';
import { Orbit, People } from '../components/kit/members';
import {
  ChangelogPanel,
  MembersPanel,
  MessagesPanel,
  RunningPanel,
} from '../components/kit/panels';
import { WritingStrip } from '../components/kit/posts';
import { AccentCard, Window } from '../components/kit/projects';
import { Page } from '../components/Shell';
import { hubContext } from '../context';
import { useHub, useRoot } from '../hub';
import { Field, Mark } from '../motion/canvases';
import { visible } from '../settings';

export const handle = {
  topics: ['deploys', 'releases', 'projects', 'members', 'stats', 'uptime', 'messages', 'posts'],
};

export function loader({ context }: Route.LoaderArgs) {
  const { directory, reads, settings, messages } = context.get(hubContext);
  const running = reads.running(directory);
  return {
    running,
    counts: reads.counts(directory, running),
    lines: reads.consoleLines(settings['rail.console.lines']),
    ticker: reads
      .consoleLines(settings['home.ticker.count'], settings['home.ticker.kinds'])
      .reverse(),
    today: new Date().toISOString().slice(0, 10),
    messages: visible(settings['home.rail']).includes('messages') ? messages.wall(5) : [],
  };
}

export default function Home({ loaderData }: Route.ComponentProps) {
  const { running, counts, lines, ticker, today, messages } = loaderData;
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
  const shownSections = visible(settings['home.sections']);
  const days = settings['home.timeline.days'];
  const recent = hub.releases.filter(
    (release) => Date.parse(release.date) >= Date.parse(today) - days * 86_400_000,
  ).length;
  const timeline = (
    <ReleaseTimeline
      releases={hub.releases}
      accentOf={(release) =>
        ownerOf(hub.projectBySlug(release.project)?.owner ?? '')?.accent ?? 'var(--color-muted)'
      }
      nameOf={(release) => hub.projectBySlug(release.project)?.name ?? release.project}
      today={today}
      days={days}
    />
  );

  const sections: Record<string, ReactNode> = {
    hero: (
      <section className="hero">
        <Field />
        <div>
          <Editable as="p" className="mono-sm mb-4 text-faint" setting="home.hero.eyebrow" />
          <h1>
            <Editable setting="home.hero.headline" />
          </h1>
          <Editable as="p" className="lede" setting="home.hero.paragraph" />
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
        </div>
      </section>
    ),
    ticker: (
      <div className="pulse">
        <div className="row">
          <Ticker lines={ticker} />
          {shownSections.includes('timeline') && (
            <span className="window-count">
              <b>{recent}</b> releases · {days} days
            </span>
          )}
        </div>
        {shownSections.includes('timeline') && timeline}
      </div>
    ),
    timeline: !shownSections.includes('ticker') && timeline,
    featured: featured.length > 0 && (
      <Band
        title={<Editable setting="home.featured.title" />}
        description={<Editable as="p" setting="home.featured.description" />}
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
        title={<Editable setting="home.members.title" />}
        description={<Editable as="p" setting="home.members.description" />}
      >
        <div className="split">
          <People members={hub.members} projectsOf={projectsOf} />
          <Orbit members={hub.members} count={counts.live} label="live right now" />
        </div>
      </Band>
    ),
    writing: hub.posts.length > 0 && (
      <Band
        title={<Editable setting="home.writing.title" />}
        more={{ to: '/blog', label: 'all the writing' }}
      >
        <WritingStrip posts={hub.posts.slice(0, settings['home.writing.count'])} />
      </Band>
    ),
    more: more.length > 0 && (
      <Band title={<Editable setting="home.more.title" />}>
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
      <Console
        initial={lines}
        limit={settings['rail.console.lines']}
        link={{ to: '/status', label: 'status' }}
      />
    ),
    changelog: (
      <ChangelogPanel
        releases={hub.releases.slice(0, settings['rail.changelog.count'])}
        projectOf={(release) => hub.projectBySlug(release.project)}
      />
    ),
    messages: <MessagesPanel messages={messages} />,
  };

  return (
    <Page
      rail={
        visible(settings['home.rail']).length > 0 &&
        visible(settings['home.rail']).map((id) => <div key={id}>{panels[id]}</div>)
      }
    >
      {shownSections.map((id) => (
        <div key={id}>{sections[id]}</div>
      ))}
    </Page>
  );
}
