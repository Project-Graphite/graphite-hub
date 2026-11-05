import type { ReactNode } from 'react';
import type { Hub } from '../../context';
import { useRoot } from '../../hub';
import type { ConsoleLine, Running } from '../../types';
import { Console } from './live';
import { RunningPanel } from './panels';

export function PageHero({
  crumb,
  title,
  children,
}: {
  crumb: ReactNode;
  title: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section className="page-hero">
      <p className="mono-sm mb-3 text-faint">{crumb}</p>
      <h1>{title}</h1>
      <div className="hero-rule mt-5.5 max-w-[52ch]" />
      {children}
    </section>
  );
}

export function loadRail({ reads, directory, settings }: Hub) {
  return {
    running: reads.running(directory),
    lines: reads.consoleLines(settings['rail.console.lines']),
  };
}

export function StandardRail({ running, lines }: { running: Running[]; lines: ConsoleLine[] }) {
  const limit = useRoot()!.settings['rail.console.lines'];
  return (
    <>
      <RunningPanel running={running} />
      <Console initial={lines} limit={limit} link={{ to: '/status', label: 'status' }} />
    </>
  );
}

export const RAIL_TOPICS = ['deploys', 'releases', 'projects', 'uptime'];
