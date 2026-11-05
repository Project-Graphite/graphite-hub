import type { Bus } from './bus.ts';
import type { Database } from './db.ts';

export interface DeployReport {
  project: string;
  tag: string;
  startedAt: string;
  finishedAt: string;
  ok: boolean;
  healthStatus?: number;
  healthMs?: number;
  by?: string;
}

const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;

export function validReport(value: unknown): value is DeployReport {
  const report = value as DeployReport;
  return (
    typeof report === 'object' &&
    report !== null &&
    SLUG.test(String(report.project)) &&
    typeof report.tag === 'string' &&
    !Number.isNaN(Date.parse(report.startedAt)) &&
    !Number.isNaN(Date.parse(report.finishedAt)) &&
    typeof report.ok === 'boolean'
  );
}

export async function recordDeploy(db: Database, bus: Bus, report: DeployReport) {
  const { changes } = db
    .prepare(
      `INSERT OR IGNORE INTO deploys (project, tag, started_at, finished_at, ok, health_status, health_ms, by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      report.project,
      report.tag,
      report.startedAt,
      report.finishedAt,
      report.ok ? 1 : 0,
      report.healthStatus ?? null,
      report.healthMs ?? null,
      report.by ?? null,
    );
  if (changes === 0) {
    return;
  }
  const durationMs = Date.parse(report.finishedAt) - Date.parse(report.startedAt);
  await bus.record({
    topic: 'deploys',
    key: report.project,
    kind: 'deploy',
    public: true,
    actor: report.by,
    summary: `${report.project} ${report.ok ? 'deployed' : 'failed to deploy'} ${report.tag.replace(/^sha-/, '').slice(0, 7)}`,
    detail: {
      project: report.project,
      tag: report.tag,
      ok: report.ok,
      durationMs,
      healthStatus: report.healthStatus,
      healthMs: report.healthMs,
    },
    at: report.finishedAt,
  });
}
