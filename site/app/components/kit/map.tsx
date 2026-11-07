import { useState } from 'react';
import { plural } from '../../format';
import { useLiveMessages } from '../../live';
import type { Country } from '../../types';
import Status from '../Status';
import { CENTROIDS, COLUMNS, LAND, ROWS } from './map-data';

const DOTS = LAND.flatMap((row, y) =>
  [...row].flatMap((cell, x) => (cell === '#' ? [`M${x + 0.5} ${y + 0.5}h0.01`] : [])),
).join('');

const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });

export function countryName(code: string) {
  try {
    return regionNames.of(code) ?? code;
  } catch {
    return code;
  }
}

export function VisitorMap({ initial }: { initial: Country[] }) {
  const [countries, setCountries] = useState(initial);
  useLiveMessages(({ topic, data }) => {
    if (topic !== 'map' || !data) {
      return;
    }
    const code = String(data.country);
    const count = Number(data.count);
    setCountries((current) =>
      [
        ...current.filter((entry) => entry.code !== code),
        ...(count > 0 ? [{ code, count }] : []),
      ].sort((a, b) => b.count - a.count || a.code.localeCompare(b.code)),
    );
  });
  const tabs = countries.reduce((sum, entry) => sum + entry.count, 0);

  return (
    <section className="atlas">
      <div className="head">
        <Status status="live" />
        <span>
          <b>{tabs}</b> {plural(tabs, 'tab')} from <b>{countries.length}</b>{' '}
          {plural(countries.length, 'country', 'countries')}
        </span>
        <span className="end">last 10 minutes</span>
      </div>
      <svg
        viewBox={`0 0 ${COLUMNS} ${ROWS}`}
        role="img"
        aria-label="Where visitors are reading from"
      >
        <path className="land" d={DOTS} />
        {countries.map(({ code, count }) => {
          const centroid = CENTROIDS[code];
          if (!centroid) {
            return null;
          }
          const [x, y] = centroid;
          const radius = 0.9 + Math.min(2, Math.log2(count) * 0.45);
          return (
            <g key={code} className="lit" style={{ transformOrigin: `${x}px ${y}px` }}>
              <title>{`${countryName(code)} · ${count}`}</title>
              <circle className="halo" cx={x} cy={y} r={radius * 2.2} />
              <circle className="ring" cx={x} cy={y} r={radius} />
              <circle className="core" cx={x} cy={y} r={radius} />
            </g>
          );
        })}
      </svg>
      {countries.length > 0 && (
        <ul className="lit-list">
          {countries.map(({ code, count }) => (
            <li key={code}>
              <b>{count}</b> {countryName(code)}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
