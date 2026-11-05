import { Fragment, type ReactNode } from 'react';
import { BLOCK_LABEL, embedSource, uploadUrl, type Block, type ShortLink } from '../../profile';
import { useHub, useRoot } from '../../hub';
import type { Model } from '../../model';
import type { Member, Project } from '../../types';
import ProjectTile from '../ProjectTile';
import Section from '../Section';
import TagList from '../TagList';
import { ReleaseTimeline } from './live';
import { Window } from './projects';

export interface PageProfile {
  bio: string | null;
  blocks: Block[];
  shortLinks: ShortLink[];
}

export function creditedProjects(hub: Model, member: Member): Project[] {
  return [...hub.projectsForMember(member), ...hub.epicsForMember(member)];
}

interface Context {
  hub: Model;
  member: Member;
  profile: PageProfile;
  today: string;
  days: number;
}

function projectsBody(block: Extract<Block, { type: 'projects' }>, { hub, member }: Context) {
  const credited = creditedProjects(hub, member);
  const projects =
    block.slugs === null
      ? credited
      : block.slugs.flatMap((slug) => credited.find((project) => project.slug === slug) ?? []);
  if (projects.length === 0) {
    return null;
  }
  return block.layout === 'windows' ? (
    <div className="band-grid two mt-0">
      {projects.map((project) => (
        <Window key={project.slug} project={project} owner={hub.memberByHandle(project.owner)} />
      ))}
    </div>
  ) : (
    <div className="grid gap-3 sm:grid-cols-2">
      {projects.map((project) => (
        <ProjectTile key={project.slug} project={project} />
      ))}
    </div>
  );
}

function timelineBody({ hub, member, today, days }: Context) {
  const releases = hub.releasesOwnedBy(member);
  return (
    releases.length > 0 && (
      <ReleaseTimeline
        releases={releases}
        accentOf={() => member.accent}
        nameOf={(release) => hub.projectBySlug(release.project)?.name ?? release.project}
        today={today}
        days={days}
      />
    )
  );
}

function body(block: Block, context: Context): ReactNode {
  const { member, profile } = context;
  switch (block.type) {
    case 'bio':
      return (
        profile.bio && <p className="max-w-[60ch] whitespace-pre-line text-muted">{profile.bio}</p>
      );
    case 'projects':
      return projectsBody(block, context);
    case 'stack':
      return (
        block.groups.length > 0 && (
          <dl className="mono-sm grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-8 gap-y-3">
            {block.groups.map((group) => (
              <Fragment key={group.group}>
                <dt className="text-faint">{group.group}</dt>
                <dd className="m-0">
                  <TagList tags={group.items} />
                </dd>
              </Fragment>
            ))}
          </dl>
        )
      );
    case 'github':
      return (
        <dl className="mono-sm grid grid-cols-[auto_minmax(0,1fr)] gap-x-8 gap-y-3">
          <dt className="text-faint">public repositories</dt>
          <dd className="m-0">{member.publicRepos ?? '—'}</dd>
          <dt className="text-faint">followers</dt>
          <dd className="m-0">{member.followers ?? '—'}</dd>
          <dt className="text-faint">since</dt>
          <dd className="m-0">{member.joined ?? '—'}</dd>
          <dt className="text-faint">profile</dt>
          <dd className="m-0">
            <a href={`https://github.com/${member.github}`} className="text-ink hover:underline">
              github.com/{member.github} ↗
            </a>
          </dd>
        </dl>
      );
    case 'timeline':
      return timelineBody(context);
    case 'links':
      return (
        block.links.length > 0 && (
          <div className="mono-sm flex flex-wrap gap-x-4.5 gap-y-2">
            {block.links.map((link) => (
              <a key={link.url} href={link.url} className="rule-link">
                {link.label} ↗
              </a>
            ))}
          </div>
        )
      );
    case 'short-links':
      return (
        member.alias &&
        profile.shortLinks.length > 0 && (
          <ul className="mono-sm grid gap-2">
            {profile.shortLinks.map((link) => (
              <li key={link.name}>
                <a href={`/${member.alias}/go/${link.name}`} className="rule-link">
                  /{member.alias}/go/{link.name}
                </a>
                <span className="ml-3 text-faint">{new URL(link.url).host}</span>
              </li>
            ))}
          </ul>
        )
      );
    case 'writing':
      return null;
    case 'gallery':
      return (
        block.images.length > 0 && (
          <div className="gallery">
            {block.images.map((image) => (
              <figure key={image.upload}>
                <a href={uploadUrl(image.upload, 'gallery')}>
                  <img
                    src={uploadUrl(image.upload, 'gallery', 'small')}
                    alt={image.caption}
                    loading="lazy"
                  />
                </a>
                {image.caption && <figcaption>{image.caption}</figcaption>}
              </figure>
            ))}
          </div>
        )
      );
    case 'text':
      return <p className="max-w-[64ch] whitespace-pre-line text-muted">{block.body}</p>;
    case 'quote':
      return (
        <blockquote className="quote">
          <p>{block.text}</p>
          {block.source && <cite>{block.source}</cite>}
        </blockquote>
      );
    case 'embed':
      return (
        <div className="embed">
          <iframe
            src={embedSource(block.url)}
            title={block.title}
            loading="lazy"
            sandbox="allow-scripts allow-same-origin allow-popups allow-presentation"
            allow="fullscreen; picture-in-picture"
          />
        </div>
      );
  }
}

export function blockTitle(block: Block) {
  return block.type === 'text' && block.title ? block.title : BLOCK_LABEL[block.type];
}

export function useRenderedBlocks(member: Member, profile: PageProfile, today: string) {
  const hub = useHub();
  const days = useRoot()!.settings['home.timeline.days'];
  const context = { hub, member, profile, today, days };
  return profile.blocks.flatMap((block) => {
    const content = body(block, context);
    return content ? [{ block, content }] : [];
  });
}

export function Blocks({ rendered }: { rendered: ReturnType<typeof useRenderedBlocks> }) {
  return rendered.map(({ block, content }) => (
    <div key={block.id} id={block.id}>
      <Section label={blockTitle(block)}>{content}</Section>
    </div>
  ));
}
