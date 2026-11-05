import { changelogPath, createModel } from './model';
import type { Directory } from './types';

export interface Hit {
  kind: 'member' | 'project' | 'release';
  title: string;
  detail: string;
  to: string;
}

export function search(directory: Directory, query: string, limit = 20): Hit[] {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return [];
  }
  const model = createModel(directory);
  const matches = (...fields: (string | null | undefined)[]) =>
    fields.some((field) => field?.toLowerCase().includes(needle));
  return [
    ...directory.members
      .filter((member) => matches(member.name, member.github, member.headline))
      .map((member): Hit => ({
        kind: 'member',
        title: member.name,
        detail: member.headline ?? `@${member.github}`,
        to: member.path,
      })),
    ...directory.projects
      .filter((project) => matches(project.name, project.slug, project.summary, ...project.tags))
      .map((project): Hit => ({
        kind: 'project',
        title: project.name,
        detail: project.summary,
        to: project.path,
      })),
    ...directory.releases.flatMap((release): Hit[] => {
      const project = model.projectBySlug(release.project);
      const line = release.title ?? release.summary ?? release.groups[0]?.changes[0]?.text ?? '';
      return project && matches(project.name, `v${release.version}`, line)
        ? [
            {
              kind: 'release',
              title: `${project.name} v${release.version}`,
              detail: line,
              to: `${changelogPath(project)}#${release.id}`,
            },
          ]
        : [];
    }),
  ].slice(0, limit);
}
