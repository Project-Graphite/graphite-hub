import { data } from 'react-router';
import type { Route } from './+types/kit';
import { Band, Button, Cover } from '../components/kit/basics';
import { Console, Counters, ReleaseTimeline, Ticker } from '../components/kit/live';
import { Orbit, People } from '../components/kit/members';
import { ChangelogPanel, MembersPanel, RunningPanel } from '../components/kit/panels';
import { AccentCard, Window } from '../components/kit/projects';
import { Page } from '../components/Shell';
import { useHub } from '../hub';
import { Field, Mark } from '../motion/canvases';
import { COUNTERS } from '../settings';
import type { ConsoleLine } from '../types';

export function loader() {
  if (!import.meta.env.DEV) {
    throw data(null, { status: 404 });
  }
  return { now: Date.now() };
}

function sampleLines(now: number): ConsoleLine[] {
  return [
    [
      'deploy',
      'strata deployed 00e840f',
      { tag: 'sha-00e840f', durationMs: 37000, healthStatus: 200, healthMs: 41 },
    ],
    ['release', 'Strata 1.2.2', { counts: { added: 2, fixed: 1 } }],
    ['sync', 'Registry synced: 0 added, 1 changed, 0 removed', { changed: ['strata'] }],
    ['uptime', '6 of 6 up over the last hour', { up: 6, total: 6, p95Ms: 62 }],
  ].map(([kind, summary, detail], index) => ({
    id: `${now}-${index}`,
    kind: kind as string,
    summary: summary as string,
    detail: detail as Record<string, unknown>,
    at: new Date(now - (4 - index) * 600_000).toISOString(),
  }));
}

export default function Kit({ loaderData }: Route.ComponentProps) {
  const { now } = loaderData;
  const LINES = sampleLines(now);
  const hub = useHub();
  const ownerOf = (slug: string) => hub.memberByHandle(hub.projectBySlug(slug)?.owner ?? '');
  const projectsOf = (member: (typeof hub.members)[number]) => hub.projectsForMember(member).length;
  const running = hub.projects
    .filter((project) => project.status === 'live' && project.url)
    .map((project, index) => ({
      slug: project.slug,
      name: project.name,
      path: project.path,
      deploy: { tag: 'sha-84803f5', at: new Date(now - index * 86_400_000).toISOString() },
      week: Array.from({ length: 7 }, (_, day) => (day === index ? 'down' : 'up') as 'up' | 'down'),
    }));

  return (
    <Page
      rail={
        <>
          <MembersPanel members={hub.members} projectsOf={projectsOf} />
          <RunningPanel running={running} />
          <ChangelogPanel
            releases={hub.releases.slice(0, 3)}
            projectOf={(release) => hub.projectBySlug(release.project)}
          />
        </>
      }
    >
      <section className="hero">
        <Field />
        <div>
          <p className="mono-sm mb-4 text-faint">/kit · development only</p>
          <h1>Every piece of the Graphite kit, on real data.</h1>
          <p className="lede">Motion follows prefers-reduced-motion and the site.motion setting.</p>
          <div className="actions">
            <Button to="/projects" primary arrow>
              primary
            </Button>
            <Button to="https://github.com/project-graphite">outline ↗</Button>
            <span className="hint">
              <span className="kbd">/</span> to search
            </span>
          </div>
          <Counters
            counts={{
              members: hub.members.length,
              projects: hub.projects.length,
              live: running.length,
              releases: hub.releases.length,
              deploys: 6,
            }}
            shown={[...COUNTERS]}
          />
        </div>
        <div className="mark">
          <Mark />
          <em>move through it</em>
        </div>
      </section>
      <Ticker lines={LINES} />
      <ReleaseTimeline
        releases={hub.releases}
        accentOf={(release) => ownerOf(release.project)?.accent ?? 'var(--color-muted)'}
        nameOf={(release) => hub.projectBySlug(release.project)?.name ?? release.project}
        today={new Date(now).toISOString().slice(0, 10)}
        days={60}
      />
      <Band
        title="Windows"
        description="Hover a window for its drawer."
        more={{ to: '/projects', label: 'more' }}
      >
        <div className="band-grid">
          {hub.rootProjects.slice(0, 3).map((project) => (
            <Window key={project.slug} project={project} owner={ownerOf(project.slug)} />
          ))}
        </div>
      </Band>
      <Band title="Members and orbit">
        <div className="split">
          <People members={hub.members} projectsOf={projectsOf} />
          <Orbit members={hub.members} count={running.length} label="live right now" />
        </div>
      </Band>
      <Band title="Accent cards and covers">
        <div className="band-grid">
          {hub.projects.slice(3, 6).map((project) => (
            <AccentCard key={project.slug} project={project} owner={ownerOf(project.slug)} />
          ))}
          <Cover name="Graphite" accent="#6f8fd1" label="cover · generated" />
        </div>
      </Band>
      <Band title="Console">
        <Console initial={LINES} limit={12} />
      </Band>
    </Page>
  );
}
