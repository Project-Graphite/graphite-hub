import type { ReactNode } from 'react';
import { accentStyle, Avatar, Button, Panel } from '../components/kit/basics';
import { blockTitle, Blocks, useRenderedBlocks, type PageProfile } from '../components/kit/blocks';
import { Fact, PageHeader } from '../components/kit/page';
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

export function MemberHero({ member, actions }: { member: Member; actions?: ReactNode }) {
  const hub = useHub();
  const live = hub.projectsOwnedBy(member).filter((project) => project.status === 'live').length;
  return (
    <PageHeader
      banner={member.coverUrl && <img className="member-cover" src={member.coverUrl} alt="" />}
      path={member.path}
      lead={<Avatar member={member} size="lg" />}
      title={member.name}
      subtitle={member.headline}
      actions={actions}
      facts={
        <>
          <Fact
            value={hub.projectsForMember(member).length + hub.epicsForMember(member).length}
            label="projects"
          />
          {live > 0 && <Fact value={live} label="live" />}
          <Fact value={hub.releasesOwnedBy(member).length} label="releases" />
          {member.joined && <Fact label="on GitHub since" value={member.joined} />}
        </>
      }
    />
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
    <div className="profile member" style={accentStyle(member.accent)}>
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
      <div className="profile member" style={accentStyle(member.accent)}>
        <MemberHero
          member={member}
          actions={
            data.editable && (
              <Button to={editPath(member)} primary>
                edit this page
              </Button>
            )
          }
        />
        <Blocks rendered={rendered} />
      </div>
    </Page>
  );
}
