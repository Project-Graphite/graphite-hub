import type { Route } from './+types/sitemap';
import { hubContext } from '../context';
import { absolute, BUILT_AT } from '../meta';
import { changelogPath, createModel, publicDirectory } from '../model';
import type { Member, Project } from '../types';

type Stamp = string | undefined;

const newest = (stamps: Stamp[]) => stamps.filter(Boolean).sort().at(-1);

export function loader({ context }: Route.LoaderArgs) {
  const hub = context.get(hubContext);
  const model = createModel(publicDirectory(hub.directory));
  const edited = hub.reads.edited();
  const written = (posts: { updatedAt: string }[]) => newest(posts.map((post) => post.updatedAt));
  const released = (project: Project) => model.releasesForProject(project)[0]?.date;
  const projectAt = (project: Project) =>
    newest([edited.projects[project.slug], released(project), written(model.postsAbout(project))]);
  const memberAt = (member: Member) =>
    newest([
      edited.members[member.handle],
      model.releasesOwnedBy(member)[0]?.date,
      written(model.postsBy(member)),
    ]);
  const membersAt = newest(model.members.map(memberAt));
  const projectsAt = newest(model.projects.map(projectAt));
  const entries: [path: string, at: Stamp][] = [
    ['/', newest([membersAt, projectsAt, written(model.posts)])],
    ['/members', membersAt],
    [
      '/epics',
      newest(
        model.projects.filter((project) => !model.rootProjects.includes(project)).map(projectAt),
      ),
    ],
    ['/projects', newest(model.rootProjects.map(projectAt))],
    ['/blog', written(model.posts)],
    ...model.members.map((member): [string, Stamp] => [member.path, memberAt(member)]),
    ...model.projects.map((project): [string, Stamp] => [project.path, projectAt(project)]),
    ...model.members.flatMap((member): [string, Stamp][] => {
      const posts = model.postsBy(member);
      return posts.length > 0 ? [[`${member.path}/blog`, written(posts)]] : [];
    }),
    ...model.posts.map((post): [string, Stamp] => [post.path, post.updatedAt]),
    ['/changelog', model.releases[0]?.date],
    ['/status', undefined],
    ['/messages', undefined],
    ['/subscribe', undefined],
    ['/privacy', undefined],
    ...model.members.flatMap((member): [string, Stamp][] => {
      const at = model.releasesOwnedBy(member)[0]?.date;
      return at ? [[changelogPath(member), at]] : [];
    }),
    ...model.projects.flatMap((project): [string, Stamp][] => {
      const at = released(project);
      return at ? [[changelogPath(project), at]] : [];
    }),
  ];
  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...entries.map(
      ([path, at]) =>
        `  <url><loc>${absolute(path)}</loc><lastmod>${at ?? BUILT_AT}</lastmod></url>`,
    ),
    '</urlset>',
    '',
  ].join('\n');
  return new Response(body, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
