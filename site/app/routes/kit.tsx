import { useState, type CSSProperties } from 'react';
import { data } from 'react-router';
import type { Route } from './+types/kit';
import { Avatar, Band, Button, Cover, Panel } from '../components/kit/basics';
import { Confirm, Segmented, Sortable, Switch } from '../components/kit/controls';
import { Console, Counters, ReleaseTimeline, Ticker } from '../components/kit/live';
import { Orbit, People } from '../components/kit/members';
import { Fact, PageHeader } from '../components/kit/page';
import { ChangelogPanel, MembersPanel, RunningPanel } from '../components/kit/panels';
import { AccentCard, Window } from '../components/kit/projects';
import { Page } from '../components/Shell';
import Status from '../components/Status';
import { useHub, useRoot } from '../hub';
import { Field, Mark } from '../motion/canvases';
import { COUNTERS, MOTION } from '../settings';
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

const BANDS = [
  ['hero', 'hero'],
  ['pulse', 'pulse'],
  ['windows', 'windows'],
  ['people', 'members and orbit'],
  ['cards', 'accent cards and covers'],
  ['controls', 'controls'],
  ['pieces', 'small pieces'],
  ['console', 'console'],
] as const;

function Controls() {
  const [on, setOn] = useState(true);
  const [layout, setLayout] = useState('windows');
  const [order, setOrder] = useState([
    { id: 'members', on: true },
    { id: 'projects', on: true },
    { id: 'releases', on: false },
  ]);
  const [chosen, setChosen] = useState(['deploy', 'release']);
  const [level, setLevel] = useState(8);
  const [fired, setFired] = useState(0);
  const accents = useRoot()!.settings['site.accents'];
  return (
    <div className="settings">
      <article className="setting">
        <div className="setting-head">
          <h3 className="setting-label">Switch and segmented</h3>
        </div>
        <div className="editor-row">
          <Switch on={on} label="Sample switch" toggle={() => setOn(!on)} />
          <Segmented
            label="Layout"
            options={[
              ['windows', 'windows'],
              ['rows', 'rows'],
            ]}
            value={layout}
            choose={setLayout}
          />
        </div>
      </article>
      <article className="setting">
        <div className="setting-head">
          <h3 className="setting-label">Range</h3>
        </div>
        <div className="range" style={{ '--fill': `${(level / 20) * 100}%` } as CSSProperties}>
          <input
            type="range"
            min={0}
            max={20}
            value={level}
            aria-label="Sample range"
            onChange={(event) => setLevel(Number(event.target.value))}
          />
          <output>{level}</output>
        </div>
      </article>
      <article className="setting" data-wide>
        <div className="setting-head">
          <h3 className="setting-label">Sortable with switches</h3>
          <span className="setting-state" data-state="saved">
            <i />
            saved
          </span>
        </div>
        <Sortable
          items={order}
          keyOf={(item) => item.id}
          labelOf={(item) => item.id}
          dimmed={(item) => !item.on}
          reorder={setOrder}
        >
          {(item) => (
            <>
              <span className="name">{item.id}</span>
              <Switch
                on={item.on}
                label={`Show ${item.id}`}
                toggle={() =>
                  setOrder(
                    order.map((other) =>
                      other.id === item.id ? { ...other, on: !other.on } : other,
                    ),
                  )
                }
              />
            </>
          )}
        </Sortable>
      </article>
      <article className="setting">
        <div className="setting-head">
          <h3 className="setting-label">Chips</h3>
        </div>
        <div className="chips">
          {['deploy', 'release', 'post', 'sync', 'uptime'].map((kind) => (
            <button
              key={kind}
              type="button"
              aria-pressed={chosen.includes(kind)}
              onClick={() =>
                setChosen(
                  chosen.includes(kind)
                    ? chosen.filter((item) => item !== kind)
                    : [...chosen, kind],
                )
              }
            >
              {kind}
            </button>
          ))}
        </div>
      </article>
      <article className="setting">
        <div className="setting-head">
          <h3 className="setting-label">Swatches</h3>
        </div>
        <div className="swatches">
          {accents.map((colour, index) => (
            <button
              key={colour}
              type="button"
              className="swatch pick"
              aria-label={colour}
              aria-pressed={index === 0}
              style={{ '--swatch': colour } as CSSProperties}
            />
          ))}
          <button type="button" className="swatch add" aria-label="Add an accent">
            +
          </button>
        </div>
      </article>
      <article className="setting">
        <div className="setting-head">
          <h3 className="setting-label">Fields</h3>
        </div>
        <label className="editor-field">
          <span>headline</span>
          <input className="field" defaultValue="Full-stack Software Engineer" />
        </label>
        <label className="editor-field">
          <span>bio</span>
          <textarea className="field" defaultValue="Builds in the open." />
        </label>
      </article>
      <article className="setting">
        <div className="setting-head">
          <h3 className="setting-label">Chip buttons and confirm</h3>
        </div>
        <div className="editor-row">
          <button type="button" className="chip-button">
            upload
          </button>
          <button type="button" className="chip-button add">
            + link
          </button>
          <Confirm label="sign everyone out" act={() => setFired(fired + 1)} />
          {fired > 0 && <span className="mono-sm text-live">fired {fired}×</span>}
        </div>
      </article>
    </div>
  );
}

export default function Kit({ loaderData }: Route.ComponentProps) {
  const { now } = loaderData;
  const LINES = sampleLines(now);
  const hub = useHub();
  const settings = useRoot()!.settings;
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
  const sample = hub.members[0];

  return (
    <Page
      rail={
        <>
          <Panel title="on this page">
            <ol className="mono-sm grid gap-1.5">
              {BANDS.map(([id, label]) => (
                <li key={id}>
                  <a href={`#${id}`} className="text-muted hover:text-ink">
                    {label}
                  </a>
                </li>
              ))}
            </ol>
          </Panel>
          <MembersPanel members={hub.members} projectsOf={projectsOf} />
          <RunningPanel running={running} />
          <ChangelogPanel
            releases={hub.releases.slice(0, 3)}
            projectOf={(release) => hub.projectBySlug(release.project)}
          />
        </>
      }
    >
      <div className="kit">
        <PageHeader
          path="/kit · development"
          title="Kit"
          actions={
            <Button to="/admin" arrow>
              admin
            </Button>
          }
          facts={
            <>
              <Fact value={BANDS.length} label="bands" />
              <Fact value={settings['site.motion'].length} label={`of ${MOTION.length} motion`} />
              <Fact value={hub.members.length} label="members" />
              <Fact value={hub.projects.length} label="projects" />
            </>
          }
        />
        <div id="hero">
          <Band title="hero">
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
              </div>
            </section>
          </Band>
        </div>
        <div id="pulse">
          <Band title="pulse">
            <div className="pulse">
              <div className="row">
                <Ticker lines={LINES} />
                <span className="window-count">
                  <b>{hub.releases.length}</b> releases · 60 days
                </span>
              </div>
              <ReleaseTimeline
                releases={hub.releases}
                accentOf={(release) => ownerOf(release.project)?.accent ?? 'var(--color-muted)'}
                nameOf={(release) => hub.projectBySlug(release.project)?.name ?? release.project}
                today={new Date(now).toISOString().slice(0, 10)}
                days={60}
              />
            </div>
          </Band>
        </div>
        <div id="windows">
          <Band title="windows" more={{ to: '/projects', label: 'all projects' }}>
            <div className="band-grid">
              {hub.rootProjects.slice(0, 3).map((project) => (
                <Window key={project.slug} project={project} owner={ownerOf(project.slug)} />
              ))}
            </div>
          </Band>
        </div>
        <div id="people">
          <Band title="members and orbit">
            <div className="split">
              <People members={hub.members} projectsOf={projectsOf} />
              <Orbit members={hub.members} count={running.length} label="live right now" />
            </div>
          </Band>
        </div>
        <div id="cards">
          <Band title="accent cards and covers">
            <div className="band-grid">
              {hub.projects.slice(3, 6).map((project) => (
                <AccentCard key={project.slug} project={project} owner={ownerOf(project.slug)} />
              ))}
              <Cover name="Graphite" accent="#6f8fd1" />
            </div>
          </Band>
        </div>
        <div id="controls">
          <Band title="controls">
            <Controls />
          </Band>
        </div>
        <div id="pieces">
          <Band title="small pieces">
            <div className="pieces">
              <div className="editor-row">
                <Button to="/projects" primary arrow>
                  primary
                </Button>
                <Button to="/projects">outline</Button>
                <span className="kbd">/</span>
              </div>
              <div className="editor-row">
                <Status status="live" />
                <Status status="wip" />
                <Status status="archived" />
                <Status status="source-only" />
              </div>
              <div className="editor-row">
                {['deploy', 'release', 'post', 'sync', 'uptime'].map((kind) => (
                  <span key={kind} className="kind" data-kind={kind}>
                    {kind}
                  </span>
                ))}
              </div>
              {sample && (
                <div className="editor-row">
                  <Avatar member={sample} size="xs" />
                  <Avatar member={sample} size="sm" />
                  <Avatar member={sample} size="md" />
                  <Avatar member={sample} />
                  <Avatar member={sample} size="lg" />
                  <span className="avatars">
                    {hub.members.slice(0, 4).map((member) => (
                      <Avatar key={member.handle} member={member} size="sm" />
                    ))}
                  </span>
                </div>
              )}
            </div>
          </Band>
        </div>
        <div id="console">
          <Band title="console">
            <Console initial={LINES} limit={12} />
          </Band>
        </div>
      </div>
    </Page>
  );
}
