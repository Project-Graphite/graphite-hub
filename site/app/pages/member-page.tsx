import { Link } from 'react-router';
import { accentStyle, Avatar, Panel } from '../components/kit/basics';
import { blockTitle, Blocks, useRenderedBlocks, type PageProfile } from '../components/kit/blocks';
import { ChangelogPanel, RunningPanel } from '../components/kit/panels';
import { Page } from '../components/Shell';
import type { Hub } from '../context';
import { useHub, useRoot } from '../hub';
import { createModel } from '../model';
import type { Member } from '../types';

export const MEMBER_TOPICS = ['deploys', 'releases', 'projects', 'uptime', 'profiles'];

export function loadMember({ reads, directory, profiles, viewer }: Hub, member: Member) {
  const owned = new Set(
    createModel(directory)
      .projectsOwnedBy(member)
      .map((project) => project.slug),
  );
  const { bio, blocks } = profiles.read(member.handle);
  return {
    page: 'member' as const,
    handle: member.handle,
    profile: { bio, blocks, shortLinks: profiles.shortLinks(member.handle) },
    running: reads.running(directory).filter((running) => owned.has(running.slug)),
    today: new Date().toISOString().slice(0, 10),
    editable: Boolean(
      viewer && (viewer.owner || viewer.login.toLowerCase() === member.github.toLowerCase()),
    ),
  };
}

export function editPath(member: Member) {
  return `${member.path}/edit`;
}

export function MemberHero({ member }: { member: Member }) {
  return (
    <section className="page-hero member-hero">
      {member.coverUrl && <img className="member-cover" src={member.coverUrl} alt="" />}
      <p className="mono-sm m-0 text-faint">{member.path}</p>
      <div className="mt-3 flex items-center gap-5">
        <Avatar member={member} size="lg" />
        <div>
          <h1 className="page-title max-w-[18ch]">{member.name}</h1>
          {member.headline && <p className="mt-2 mb-0 text-muted">{member.headline}</p>}
        </div>
      </div>
    </section>
  );
}

export function MemberView({
  member,
  profile,
  today,
}: {
  member: Member;
  profile: PageProfile;
  today: string;
}) {
  const rendered = useRenderedBlocks(member, profile, today);
  return (
    <div style={accentStyle(member.accent)}>
      <MemberHero member={member} />
      <Blocks rendered={rendered} />
    </div>
  );
}

export function MemberPage({ data }: { data: ReturnType<typeof loadMember> }) {
  const hub = useHub();
  const settings = useRoot()!.settings;
  const member = hub.memberByHandle(data.handle)!;
  const releases = hub.releasesOwnedBy(member);
  const rendered = useRenderedBlocks(member, data.profile, data.today);

  return (
    <Page
      rail={
        <>
          {data.editable && (
            <Link to={editPath(member)} className="btn primary justify-center">
              edit this page
            </Link>
          )}
          {rendered.length > 2 && (
            <Panel title="on this page">
              <ol className="mono-sm grid gap-1.5">
                {rendered.map(({ block }) => (
                  <li key={block.id}>
                    <a href={`#${block.id}`} className="text-muted hover:text-ink">
                      {blockTitle(block)}
                    </a>
                  </li>
                ))}
              </ol>
            </Panel>
          )}
          {releases.length > 0 && (
            <ChangelogPanel
              releases={releases.slice(0, settings['rail.changelog.count'] + 2)}
              projectOf={(release) => hub.projectBySlug(release.project)}
            />
          )}
          {data.running.length > 0 && <RunningPanel running={data.running} />}
        </>
      }
    >
      <div style={accentStyle(member.accent)}>
        <MemberHero member={member} />
        <Blocks rendered={rendered} />
      </div>
    </Page>
  );
}
