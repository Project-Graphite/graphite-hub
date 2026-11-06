import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Link } from 'react-router';
import { useFolded } from '../../folds';
import { clock, day, describe } from '../../format';
import { useLiveMessages } from '../../live';
import { releaseLine } from '../../model';
import { useCountUp, useCycle } from '../../motion/motion';
import type { COUNTERS } from '../../settings';
import type { ConsoleLine, Counts, Release } from '../../types';
import Status from '../Status';
import { Fold } from './basics';

const COUNTER_LABEL: Record<(typeof COUNTERS)[number], string> = {
  members: 'members',
  projects: 'projects',
  live: 'live right now',
  releases: 'releases',
  deploys: 'deploys this week',
};

function Counter({ value, label }: { value: number; label: string }) {
  const shown = useCountUp(value);
  return (
    <div className="counter">
      <div className="n">{shown}</div>
      <div className="l">{label}</div>
    </div>
  );
}

export function Counters({ counts, shown }: { counts: Counts; shown: string[] }) {
  return (
    <div className="counters">
      {shown.map((key) => (
        <Counter
          key={key}
          value={counts[key as keyof Counts]}
          label={COUNTER_LABEL[key as keyof Counts]}
        />
      ))}
    </div>
  );
}

function Kind({ kind }: { kind: string }) {
  return (
    <span className="kind" data-kind={kind}>
      {kind === 'uptime' ? 'up' : kind}
    </span>
  );
}

export function Ticker({ lines }: { lines: ConsoleLine[] }) {
  const index = useCycle(lines.length, 3500);
  const line = lines[index];
  return (
    <div className="ticker">
      <Status status="live" />
      {line ? (
        <span className="cycle">
          <span key={line.id}>
            <Kind kind={line.kind} />
            {line.summary}
          </span>
        </span>
      ) : (
        <span className="cycle">nothing has happened yet</span>
      )}
    </div>
  );
}

interface TimelineProps {
  releases: Release[];
  accentOf: (release: Release) => string;
  nameOf: (release: Release) => string;
  today: string;
  days: number;
}

const DAY = 86_400_000;

export function ReleaseTimeline({ releases, accentOf, nameOf, today, days }: TimelineProps) {
  const [tip, setTip] = useState<{ date: string; releases: Release[] } | null>(null);
  const end = Date.parse(today);
  const start = end - days * DAY;
  const at = (iso: string) => ((Date.parse(iso) - start) / (end - start)) * 100;
  const ticks = useMemo(() => {
    const weeks = Math.ceil(days / 70);
    return Array.from(
      { length: Math.floor(days / 7 / weeks) + 1 },
      (_, tick) => new Date(start + tick * weeks * 7 * DAY),
    );
  }, [start, days]);
  const byDay = useMemo(() => {
    const groups = new Map<string, Release[]>();
    for (const release of releases) {
      const date = Date.parse(release.date);
      if (date >= start && date <= end) {
        groups.set(release.date, [...(groups.get(release.date) ?? []), release]);
      }
    }
    return [...groups.entries()];
  }, [releases, start, end]);
  const size = (group: Release[]) =>
    7 +
    Math.sqrt(
      group.reduce(
        (sum, release) =>
          sum + release.groups.reduce((total, changes) => total + changes.changes.length, 0),
        0,
      ),
    ) *
      2.2;
  const label = (release: Release) => `${nameOf(release)} v${release.version}`;

  return (
    <div className="timeline">
      <div
        className="track"
        role="group"
        aria-label={`Releases over the last ${days} days`}
        onPointerLeave={() => setTip(null)}
      >
        {ticks.map((tick) => (
          <span
            key={tick.toISOString()}
            className="tick"
            style={{ left: `${at(tick.toISOString())}%` }}
          >
            <span>{day(tick.toISOString())}</span>
          </span>
        ))}
        <span className="today" />

        {byDay.map(([date, group]) => (
          <button
            key={date}
            type="button"
            className="dot"
            aria-label={`${group.map(label).join(', ')}, ${date}`}
            style={
              {
                left: `${at(date)}%`,
                '--size': `${size(group).toFixed(1)}px`,
                '--accent': accentOf(group[0]),
              } as CSSProperties
            }
            onPointerEnter={() => setTip({ date, releases: group })}
            onFocus={() => setTip({ date, releases: group })}
            onBlur={() => setTip(null)}
          />
        ))}
        {tip && (
          <div
            className="tip"
            data-align={at(tip.date) < 20 ? 'start' : at(tip.date) > 80 ? 'end' : 'center'}
            style={{ left: `${at(tip.date)}%` }}
          >
            <strong>
              {tip.releases.length === 1
                ? label(tip.releases[0])
                : `${tip.releases.length} releases`}
            </strong>
            <span className="d">{tip.date}</span>
            <span className="l">
              {tip.releases.length === 1
                ? releaseLine(tip.releases[0], nameOf(tip.releases[0]))
                : [
                    ...tip.releases.slice(0, 4).map(label),
                    ...(tip.releases.length > 4 ? [`${tip.releases.length - 4} more`] : []),
                  ].join(' · ')}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

const FILTERS = ['all', 'deploy', 'release', 'post', 'sync', 'uptime'];
const FILTER_LABEL: Record<string, string> = { uptime: 'up' };

export function Console({
  initial,
  limit,
  tall = false,
  link,
}: {
  initial: ConsoleLine[];
  limit: number;
  tall?: boolean;
  link?: { to: string; label: string };
}) {
  const [arrived, setArrived] = useState<ConsoleLine[]>([]);
  const [filter, setFilter] = useState('all');
  const [open, setOpen] = useState<string | null>(null);
  const [folded, toggle] = useFolded('console');
  const box = useRef<HTMLDivElement>(null);

  useLiveMessages((message) => {
    const line = message.console;
    if (line && message.id) {
      setArrived((current) =>
        [...current.filter((item) => item.id !== message.id), { id: message.id, ...line }].slice(
          -limit,
        ),
      );
    }
  });

  const lines = useMemo(() => {
    const byId = new Map([...initial, ...arrived].map((line) => [line.id, line]));
    return [...byId.values()].sort((a, b) => a.at.localeCompare(b.at)).slice(-limit);
  }, [initial, arrived, limit]);
  const hours = useMemo(() => {
    const newest = Date.parse(lines.at(-1)?.at ?? new Date(0).toISOString());
    return Array.from(
      { length: 24 },
      (_, hour) =>
        lines.filter((line) => {
          const age = (newest - Date.parse(line.at)) / 3_600_000;
          return age >= 23 - hour && age < 24 - hour;
        }).length,
    );
  }, [lines]);
  useEffect(() => {
    const element = box.current;
    if (element) {
      element.scrollTop = element.scrollHeight;
    }
  }, [lines, filter, folded]);

  return (
    <aside className="console" data-folded={folded || undefined}>
      <div className="top">
        <Fold open={!folded} toggle={toggle}>
          <Status status="live" />
        </Fold>
        <span className="rate" aria-hidden="true">
          {hours.map((count, hour) => (
            <i
              key={hour}
              className={count >= 3 ? 'high' : ''}
              style={{ height: `${2 + Math.min(count, 6) * 2}px` }}
            />
          ))}
        </span>
        {link && (
          <Link to={link.to} className="rule-link">
            {link.label}
          </Link>
        )}
      </div>
      <div className="filters" hidden={folded}>
        {FILTERS.map((kind) => (
          <button
            key={kind}
            type="button"
            aria-pressed={filter === kind}
            onClick={() => setFilter(kind)}
          >
            {FILTER_LABEL[kind] ?? kind}
          </button>
        ))}
      </div>
      <div ref={box} className={`lines ${tall ? 'tall' : ''}`} hidden={folded}>
        {lines
          .filter((line) => filter === 'all' || line.kind === filter)
          .map((line) => (
            <button
              key={line.id}
              type="button"
              className="line"
              data-kind={line.kind}
              aria-expanded={open === line.id}
              onClick={() => setOpen(open === line.id ? null : line.id)}
            >
              <span className="t">{clock(line.at)}</span>
              <Kind kind={line.kind} />
              <span className="m">{line.summary}</span>
              <span className="x">{describe(line.detail) || line.at}</span>
            </button>
          ))}
      </div>
    </aside>
  );
}
