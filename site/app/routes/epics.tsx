import { Link } from 'react-router';
import type { Route } from './+types/epics';
import { accentStyle, Avatar } from '../components/kit/basics';
import { ProjectNode } from '../components/kit/directory';
import { ReleaseTimeline } from '../components/kit/live';
import { Fact, loadRail, PageHeader, StandardRail } from '../components/kit/page';
import Status from '../components/Status';
import TagList from '../components/TagList';
import { Page } from '../components/Shell';
import { hubContext } from '../context';
import { day } from '../format';
import { useHub } from '../hub';
import { useSpotlight } from '../motion/motion';
import { topicsFor } from '../topics';
import type { Project } from '../types';

export const handle = topicsFor('epics');

const WINDOW_DAYS = 180;

export function loader({ context }: Route.LoaderArgs) {
  return { ...loadRail(context.get(hubContext)), today: new Date().toISOString().slice(0, 10) };
}

function Epic({ epic, today }: { epic: Project; today: string }) {
  const hub = useHub();
  const spot = useSpotlight<HTMLElement>();
  const owner = hub.memberByHandle(epic.owner);
  const children = hub.childProjects(epic.slug);
  const releases = hub.releasesForProject(epic);
  const recent = releases.filter(
    (release) => Date.parse(release.date) >= Date.parse(today) - WINDOW_DAYS * 86_400_000,
  );
  const latest = releases[0];
  return (
    <article ref={spot} className="epic spot" style={accentStyle(epic.accent ?? owner?.accent)}>
      <header>
        <div className="title">
          <h2>
            <Link to={epic.path}>{epic.name}</Link>
          </h2>
          <Status status={epic.status} />
        </div>
        <p className="summary">{epic.summary}</p>
        <div className="meta">
          <span className="facts">
            <Fact value={children.length} label={children.length === 1 ? 'project' : 'projects'} />
            <Fact value={releases.length} label={releases.length === 1 ? 'release' : 'releases'} />
            {latest && <Fact label="latest" value={`v${latest.version} · ${day(latest.date)}`} />}
          </span>
          <TagList tags={epic.tags} />
        </div>
      </header>
      {recent.length > 0 && (
        <ReleaseTimeline
          releases={releases}
          accentOf={(release) =>
            hub.memberByHandle(hub.projectBySlug(release.project)?.owner ?? '')?.accent ??
            'var(--color-muted)'
          }
          nameOf={(release) => hub.projectBySlug(release.project)?.name ?? release.project}
          today={today}
          days={WINDOW_DAYS}
        />
      )}
      <div className="cluster">
        {children.map((child) => (
          <ProjectNode
            key={child.slug}
            project={child}
            owner={hub.memberByHandle(child.owner)}
            releases={hub.releasesForProject(child)}
            today={today}
          />
        ))}
      </div>
      <div className="foot">
        {owner && (
          <Link to={owner.path} className="by">
            <Avatar member={owner} size="xs" />
            {owner.name}
          </Link>
        )}
        <span className="links">
          {epic.url && (
            <a href={epic.url} className="rule-link">
              {new URL(epic.url).host}
            </a>
          )}
          <a href={epic.repoUrl} className="rule-link">
            source ↗
          </a>
        </span>
      </div>
    </article>
  );
}

export default function Epics({ loaderData }: Route.ComponentProps) {
  const hub = useHub();
  const { today } = loaderData;
  const inside = hub.epics.reduce((sum, epic) => sum + hub.childProjects(epic.slug).length, 0);
  const released = hub.epics.reduce((sum, epic) => sum + hub.releasesForProject(epic).length, 0);
  return (
    <Page rail={<StandardRail {...loaderData} />}>
      <PageHeader
        path="/epics"
        title="Epics"
        facts={
          <>
            <Fact value={hub.epics.length} label={hub.epics.length === 1 ? 'epic' : 'epics'} />
            <Fact value={inside} label="projects inside" />
            <Fact value={released} label="releases" />
          </>
        }
      />
      <section className="band dir epics">
        {hub.epics.map((epic) => (
          <Epic key={epic.path} epic={epic} today={today} />
        ))}
      </section>
    </Page>
  );
}
