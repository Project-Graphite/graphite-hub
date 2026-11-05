import type { ReactNode } from 'react';
import type { Hub } from '../../context';
import { useRoot } from '../../hub';
import { Field } from '../../motion/canvases';
import { useCountUp } from '../../motion/motion';
import type { ConsoleLine, Running } from '../../types';
import { Console } from './live';
import { RunningPanel } from './panels';

function Count({ value }: { value: number }) {
  return useCountUp(value);
}

export function Fact({ value, label }: { value: ReactNode; label: string }) {
  return typeof value === 'number' ? (
    <span className="fact">
      <b>
        <Count value={value} />
      </b>{' '}
      {label}
    </span>
  ) : (
    <span className="fact">
      {label} <b>{value}</b>
    </span>
  );
}

interface PageHeaderProps {
  path: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  lead?: ReactNode;
  aside?: ReactNode;
  actions?: ReactNode;
  facts?: ReactNode;
  banner?: ReactNode;
  children?: ReactNode;
}

export function PageHeader({
  path,
  title,
  subtitle,
  lead,
  aside,
  actions,
  facts,
  banner,
  children,
}: PageHeaderProps) {
  return (
    <header className="page-head">
      <Field density={3600} reach={90} />
      {banner}
      <p className="path">{path}</p>
      <div className="row">
        {lead}
        <div className="heading">
          <div className="title">
            <h1>{title}</h1>
            {aside}
          </div>
          {subtitle && <p className="sub">{subtitle}</p>}
        </div>
        {actions && <div className="tools">{actions}</div>}
      </div>
      <div className="rule">{facts && <span className="facts">{facts}</span>}</div>
      {children}
    </header>
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
