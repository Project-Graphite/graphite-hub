import type { ConsoleLine } from './types';

export const CONSOLE_KINDS = [
  'deploy',
  'release',
  'post',
  'health',
  'project',
  'member',
  'star',
  'milestone',
  'wall',
  'sync',
] as const;

export type ConsoleKind = (typeof CONSOLE_KINDS)[number];

export function foldRuns(lines: ConsoleLine[]) {
  const folded: ConsoleLine[] = [];
  for (const line of lines) {
    const previous = folded.at(-1);
    if (previous && previous.kind === line.kind && previous.summary === line.summary) {
      folded[folded.length - 1] = { ...line, count: (previous.count ?? 1) + (line.count ?? 1) };
    } else {
      folded.push(line);
    }
  }
  return folded;
}
