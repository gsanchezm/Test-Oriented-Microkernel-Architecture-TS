// Normalizes Gatling performance summaries (PerformanceSummary) into a flat CSV.
// Source: metrics/raw/gatling/<runId>/summary.json (one row per file).
// Columns: COMMON_COLUMNS(tool_name='gatling',platform='performance') + simulation_name,request_count,
//          success_count,failure_count,mean_response_time_ms,p95_response_time_ms,duration_ms
import { join } from 'path';
import { safeMain } from './lib/run';
import { P } from './lib/paths';
import { COMMON_COLUMNS, commonColumns, loadManifests, indexByRunId } from './lib/manifest';
import { writeCsv } from './lib/csv';
import { readJsonFile } from './lib/jsonl';
import { listSubdirs } from './lib/discover';

// Mirrors PerformanceSummary from src/plugins/gatling/actions/performance-telemetry-writer.ts.
// Defined locally rather than imported because that module has an `@core/*` runtime import
// the metrics tsconfig (empty `paths`) cannot resolve. Keep field names in sync if the source changes.
interface PerformanceSummary {
  runId: string;
  timestamp: string;
  simulationName: string;
  status: 'PASS' | 'FAIL';
  durationMs: number;
  requestCount: number;
  successCount: number;
  failureCount: number;
  meanResponseTimeMs: number;
  p95ResponseTimeMs: number;
  errorMessage: string | null;
}

const COLUMNS = [
  ...COMMON_COLUMNS,
  'simulation_name',
  'request_count',
  'success_count',
  'failure_count',
  'mean_response_time_ms',
  'p95_response_time_ms',
  'duration_ms',
];

safeMain('normalize-gatling-summary', () => {
  const idx = indexByRunId(loadManifests());
  const rows: Array<Record<string, unknown>> = [];

  for (const sub of listSubdirs(P.rawGatling)) {
    const file = join(P.rawGatling, sub, 'summary.json');
    const s = readJsonFile<PerformanceSummary>(file);
    if (!s || typeof s !== 'object') continue;
    const runId = typeof s.runId === 'string' && s.runId ? s.runId : sub;
    rows.push({
      ...commonColumns(runId, idx),
      tool_name: 'gatling',
      platform: 'performance',
      status: s.status ?? 'UNKNOWN',
      simulation_name: s.simulationName ?? '',
      request_count: s.requestCount ?? '',
      success_count: s.successCount ?? '',
      failure_count: s.failureCount ?? '',
      mean_response_time_ms: s.meanResponseTimeMs ?? '',
      p95_response_time_ms: s.p95ResponseTimeMs ?? '',
      duration_ms: s.durationMs ?? '',
    });
  }

  writeCsv(join(P.processed, 'performance_summary.csv'), COLUMNS, rows);
  console.log(`[normalize-gatling-summary] ${rows.length} rows`);
});
