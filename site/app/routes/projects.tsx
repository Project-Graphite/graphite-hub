import { useCallback, useState, type CSSProperties } from 'react';
import { Link } from 'react-router';
import type { Route } from './+types/projects';
import { accentStyle, Avatar, Cover } from '../components/kit/basics';
import { Chips, Pulse } from '../components/kit/directory';
import { Fact, loadRail, PageHeader, RAIL_TOPICS, StandardRail } from '../components/kit/page';
import Status from '../components/Status';
import { Page } from '../components/Shell';
import { hubContext } from '../context';
import { day } from '../format';
import { useHub } from '../hub';
import { STATUS_LABEL } from '../model';
import { useSpotlight, useTilt } from '../motion/motion';
import type { Member, Project, ProjectStatus, Release } from '../types';

export const handle = { topics: RAIL_TOPICS };

export function loader({ context }: Route.LoaderArgs) {
  return { ...loadRail(context.get(hubContext)), today: new Date().toISOString().slice(0, 10) };
}

const SORTS = [
  { id: 'recent', label: 'recent' },
  { id: 'name', label: 'a–z' },
];

function Entry({
  project,
  owner,
  releases,
  today,
  index,
  tag,
  pickTag,
}: {
  project: Project;
  owner: Member | undefined;
  releases: Release[];
  today: string;
  index: number;
  tag: string | null;
  pickTag: (tag: string) => void;
}) {
  const tilt = useTilt<HTMLElement>();
  const spot = useSpotlight<HTMLElement>();
  const pointer = useCallback(
    (element: HTMLElement | null) => {
      tilt(element);
      spot(element);
    },
    [tilt, spot],
  );
  const accent = project.accent ?? owner?.accent ?? '';
  const latest = releases[0];
  return (
    <article
      ref={pointer}
      className="entry spot tilt"
      style={{ ...accentStyle(accent), '--i': index } as CSSProperties}
    >
      <Link to={project.path} className="face" tabIndex={-1} aria-hidden="true">
        <Cover name={project.name} accent={accent} image={project.coverUrl} />
      </Link>
      <div className="body">
        <div className="title">
          <h3>
            <Link to={project.path}>{project.name}</Link>
          </h3>
          <Status status={project.status} />
        </div>
        <p className="summary">{project.summary}</p>
        <div className="chips">
          {project.tags.map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={tag === item}
              onClick={() => pickTag(item)}
            >
              {item}
            </button>
          ))}
        </div>
        <div className="cadence">
          <Pulse releases={releases} today={today} />
          <span className="latest">
            {latest ? (
              <>
                <b>v{latest.version}</b> {day(latest.date)}
                <span className="n">
                  {releases.length} {releases.length === 1 ? 'release' : 'releases'}
                </span>
              </>
            ) : (
              'unreleased'
            )}
          </span>
        </div>
        <div className="foot">
          {owner ? (
            <Link to={owner.path} className="by">
              <Avatar member={owner} size="xs" />
              {owner.name}
            </Link>
          ) : (
            <span className="by">{project.owner}</span>
          )}
          <span className="links">
            {project.url && (
              <a href={project.url} className="rule-link">
                {new URL(project.url).host}
              </a>
            )}
            <a href={project.repoUrl} className="rule-link">
              source ↗
            </a>
          </span>
        </div>
      </div>
    </article>
  );
}

export default function Projects({ loaderData }: Route.ComponentProps) {
  const hub = useHub();
  const { today } = loaderData;
  const [status, setStatus] = useState('all');
  const [tag, setTag] = useState<string | null>(null);
  const [sort, setSort] = useState('recent');
  const all = hub.rootProjects;
  const statuses = (Object.keys(STATUS_LABEL) as ProjectStatus[])
    .map((id) => ({
      id,
      label: STATUS_LABEL[id],
      count: all.filter((p) => p.status === id).length,
    }))
    .filter((choice) => choice.count > 0);
  const shown = all
    .filter((project) => status === 'all' || project.status === status)
    .filter((project) => !tag || project.tags.includes(tag))
    .sort((a, b) =>
      sort === 'name'
        ? a.name.localeCompare(b.name)
        : Number(b.pinned) - Number(a.pinned) ||
          hub.lastPublishedOn(b).localeCompare(hub.lastPublishedOn(a)) ||
          a.name.localeCompare(b.name),
    );
  const slugs = new Set(all.map((project) => project.slug));
  const latest = hub.releases.find((release) => slugs.has(release.project));
  const pickTag = (item: string) => setTag((current) => (current === item ? null : item));

  return (
    <Page rail={<StandardRail {...loaderData} />}>
      <PageHeader
        path="/projects"
        title="Projects"
        actions={
          <>
            <Chips
              label="Status"
              value={status}
              onChange={setStatus}
              choices={[{ id: 'all', label: 'all', count: all.length }, ...statuses]}
            />
            <Chips label="Order" value={sort} onChange={setSort} choices={SORTS} />
          </>
        }
        facts={
          <>
            <Fact value={all.length} label="projects" />
            <Fact
              value={hub.releases.filter((r) => slugs.has(r.project)).length}
              label="releases"
            />
            {latest && <Fact label="last release" value={day(latest.date)} />}
            {tag && (
              <button type="button" className="fact pick" onClick={() => setTag(null)}>
                <b>{tag}</b> ×
              </button>
            )}
          </>
        }
      />
      <section className="band dir">
        <div key={`${status}:${tag}:${sort}`} className="entries">
          {shown.map((project, index) => (
            <Entry
              key={project.slug}
              project={project}
              owner={hub.memberByHandle(project.owner)}
              releases={hub.releasesForProject(project)}
              today={today}
              index={index}
              tag={tag}
              pickTag={pickTag}
            />
          ))}
          {shown.length === 0 && <p className="none">nothing here</p>}
        </div>
      </section>
    </Page>
  );
}
