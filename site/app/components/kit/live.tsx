import { useMemo, useState } from 'react';
import { clock, day, describe, KIND_LABEL } from '../../format';
import { useLiveMessages } from '../../live';
import { useCountUp, useCycle } from '../../motion/motion';
import type { COUNTERS } from '../../settings';
import type { ConsoleLine, Counts, Release } from '../../types';
import Status from '../Status';

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

export function Ticker({ lines }: { lines: ConsoleLine[] }) {
  const index = useCycle(lines.length, 3500);
  const line = lines[index];
  return (
    <div className="ticker">
      <span>
        <Status status="live" />
      </span>
      {line ? (
        <span className="cycle">
          <span key={line.id}>
            <strong>{KIND_LABEL[line.kind] ?? line.kind}</strong> {line.summary}
          </span>
        </span>
      ) : (
        <span className="cycle">nothing has happened yet</span>
      )}
      <span className="text-faint">updates as it happens</span>
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

export function ReleaseTimeline({ releases, accentOf, nameOf, today, days }: TimelineProps) {
  const [tip, setTip] = useState<{ release: Release; left: number; top: number } | null>(null);
  const end = Date.parse(today);
  const start = end - days * 86_400_000;
  const x = (iso: string) => 20 + ((Date.parse(iso) - start) / (end - start)) * 960;
  const ticks = useMemo(
    () =>
      Array.from(
        { length: Math.floor(days / 7) + 1 },
        (_, week) => new Date(start + week * 7 * 86_400_000),
      ),
    [start, days],
  );
  const shown = releases.filter((release) => Date.parse(release.date) >= start);
  const size = (release: Release) =>
    4 + Math.sqrt(release.groups.reduce((sum, group) => sum + group.changes.length, 0)) * 2.2;

  return (
    <div className="timeline">
      <svg
        viewBox="0 0 1000 110"
        role="img"
        aria-label={`Releases over the last ${days} days`}
        onPointerLeave={() => setTip(null)}
      >
        <line x1="20" y1="70" x2="980" y2="70" stroke="var(--color-line)" />
        {ticks.map((tick) => (
          <g key={tick.toISOString()}>
            <line
              x1={x(tick.toISOString())}
              y1="66"
              x2={x(tick.toISOString())}
              y2="74"
              stroke="var(--color-line)"
            />
            <text
              x={x(tick.toISOString())}
              y="96"
              textAnchor="middle"
              fontFamily="var(--font-mono)"
              fontSize="11"
              fill="var(--color-faint)"
            >
              {day(tick.toISOString())}
            </text>
          </g>
        ))}
        <line x1="980" y1="20" x2="980" y2="70" stroke="var(--color-live)" strokeDasharray="3 3" />
        <text
          x="980"
          y="14"
          textAnchor="end"
          fontFamily="var(--font-mono)"
          fontSize="11"
          fill="var(--color-live)"
        >
          today
        </text>
        {shown.map((release) => (
          <circle
            key={release.id}
            cx={x(release.date)}
            cy="70"
            r={size(release).toFixed(1)}
            fill={accentOf(release)}
            fillOpacity=".55"
            stroke={accentOf(release)}
            onPointerEnter={(event) => {
              const svg = event.currentTarget.ownerSVGElement!.getBoundingClientRect();
              const dot = event.currentTarget.getBoundingClientRect();
              setTip({
                release,
                left: dot.left + dot.width / 2 - svg.left,
                top: dot.top - svg.top,
              });
            }}
          />
        ))}
      </svg>
      {tip && (
        <div className="tip" style={{ left: tip.left, top: tip.top }}>
          <strong>
            {nameOf(tip.release)} v{tip.release.version}
          </strong>
          <span className="d">{tip.release.date}</span>
          <span className="l">
            {tip.release.title ?? tip.release.summary ?? tip.release.groups[0]?.changes[0]?.text}
          </span>
        </div>
      )}
    </div>
  );
}

const FILTERS = ['all', 'deploy', 'release', 'post', 'sync', 'uptime'];

export function Console({
  initial,
  limit,
  tall = false,
}: {
  initial: ConsoleLine[];
  limit: number;
  tall?: boolean;
}) {
  const [arrived, setArrived] = useState<ConsoleLine[]>([]);
  const [filter, setFilter] = useState('all');
  const [open, setOpen] = useState<string | null>(null);

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

  return (
    <div className="console">
      <div className="top">
        <Status status="live" />
        <span>public events only</span>
        <span className="rate" aria-hidden="true">
          {hours.map((count, hour) => (
            <i
              key={hour}
              className={count >= 3 ? 'high' : ''}
              style={{ height: `${2 + Math.min(count, 6) * 2}px` }}
            />
          ))}
        </span>
      </div>
      <div className="filters">
        {FILTERS.map((kind) => (
          <button
            key={kind}
            type="button"
            aria-pressed={filter === kind}
            onClick={() => setFilter(kind)}
          >
            {kind}
          </button>
        ))}
      </div>
      <div className={`lines ${tall ? 'tall' : ''}`}>
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
              <span className="k">{line.kind === 'uptime' ? 'up' : line.kind}</span>
              <span className="m">{line.summary}</span>
              <span className="x">{describe(line.detail) || line.at}</span>
            </button>
          ))}
      </div>
      <div className="foot">
        <span>
          <span className="cursor" />
          following
        </span>
        <span>never shows hosts, paths, env or drafts</span>
      </div>
    </div>
  );
}
