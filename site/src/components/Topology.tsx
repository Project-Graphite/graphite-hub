import { Fragment } from 'react';
import type { TopologyData } from '../types';
import styles from './Topology.module.css';

const BOX_W = 136;
const BOX_H = 58;
const GAP = 20;
const PAD = 10;
const MIN_W = 488;
const INGRESS_H = 26;
const ROW_Y = 78;
const BUS_Y = ROW_Y + BOX_H + 20;
const DB_Y = BUS_Y + 22;
const DB_H = 26;

interface Props {
  topology: TopologyData;
  host: string;
}

export default function Topology({ topology, host }: Props) {
  const hasDatabase = topology.database !== 'none';
  const count = topology.services.length;
  const spanW = count * BOX_W + Math.max(count - 1, 0) * GAP;
  const width = Math.max(spanW + PAD * 2, MIN_W);
  const height = (hasDatabase ? DB_Y + DB_H : ROW_Y + BOX_H) + PAD;
  const centre = width / 2;
  const inset = (width - spanW) / 2;
  const elbowY = (INGRESS_H + ROW_Y) / 2;

  const placed = topology.services.map((service, index) => ({
    ...service,
    x: inset + index * (BOX_W + GAP),
    cx: inset + index * (BOX_W + GAP) + BOX_W / 2,
  }));

  const routed = placed.filter((service) => service.route !== null);
  const ingressW = Math.min(spanW, 260);

  const described = placed
    .map((service) =>
      service.route ? `${service.name} at ${service.route}` : `${service.name}, internal`,
    )
    .join('; ');

  return (
    <svg
      className={styles.topology}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      preserveAspectRatio="xMidYMid meet"
    >
      <title>{`${host}: ${described}${hasDatabase ? `; shared ${topology.database}` : ''}`}</title>

      {routed.length > 0 && (
        <>
          <rect
            className={styles.pill}
            x={centre - ingressW / 2}
            y={0}
            width={ingressW}
            height={INGRESS_H}
            rx={INGRESS_H / 2}
          />
          <text className={styles.pillLabel} x={centre} y={17} textAnchor="middle">
            {host}
          </text>
          {routed.map((service) => (
            <path
              key={`ingress-${service.name}`}
              className={styles.edge}
              d={`M ${centre} ${INGRESS_H} V ${elbowY} H ${service.cx} V ${ROW_Y}`}
            />
          ))}
        </>
      )}

      {hasDatabase && (
        <>
          {placed.map((service) => (
            <path
              key={`bus-${service.name}`}
              className={`${styles.edge} ${styles.edgeSoft}`}
              d={`M ${service.cx} ${ROW_Y + BOX_H} V ${BUS_Y}`}
            />
          ))}
          <path
            className={`${styles.edge} ${styles.edgeSoft}`}
            d={`M ${placed[0].cx} ${BUS_Y} H ${placed[count - 1].cx}`}
          />
          <path
            className={`${styles.edge} ${styles.edgeSoft}`}
            d={`M ${centre} ${BUS_Y} V ${DB_Y}`}
          />
          <rect
            className={styles.pill}
            x={centre - 62}
            y={DB_Y}
            width={124}
            height={DB_H}
            rx={DB_H / 2}
          />
          <text className={styles.pillLabel} x={centre} y={DB_Y + 17} textAnchor="middle">
            {topology.database}
          </text>
        </>
      )}

      {placed.map((service) => (
        <Fragment key={service.name}>
          <rect
            className={service.route === null ? `${styles.node} ${styles.internal}` : styles.node}
            x={service.x}
            y={ROW_Y}
            width={BOX_W}
            height={BOX_H}
            rx={8}
          />
          <text className={styles.nodeName} x={service.cx} y={ROW_Y + 25} textAnchor="middle">
            {service.name}
          </text>
          <text className={styles.nodeMeta} x={service.cx} y={ROW_Y + 43} textAnchor="middle">
            {service.route === null
              ? 'internal'
              : service.port === null
                ? service.route
                : `${service.route}  :${service.port}`}
          </text>
        </Fragment>
      ))}
    </svg>
  );
}
