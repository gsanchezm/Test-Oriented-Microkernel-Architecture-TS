// Architecture-quality: Performance Efficiency.
// Scenario-duration distribution + workflow/job wall-clock spans + TOM-only proxy/IPC
// overhead. Overhead rows are flagged 'TOM-only overhead' so a future gTAA baseline
// (which has no proxy) leaves them null. Missing/empty CSV -> NOT_AVAILABLE.
import { join } from 'path';
import { writeQualityCsv, QualityRecord, safeMain, NA } from './lib/quality';
import { readCsv, mean, percentile, round2 } from './lib/csv';
import { P } from './lib/paths';
import { loadManifests } from './lib/manifest';

const CATEGORY = 'Performance Efficiency';

function nums(rows: Record<string, string>[], col: string): number[] {
  return rows
    .map((r) => Number(r[col]))
    .filter((n) => Number.isFinite(n));
}

/** number|null -> metric value: null (empty) when no data is available -> NA instead. */
function valOrNA(v: number | null): number | string {
  return v === null ? NA : (round2(v) as number);
}

function main(): void {
  const records: QualityRecord[] = [];

  const scenarioDurations = readCsv(join(P.processed, 'scenario_durations.csv'));
  const proxyOverhead = readCsv(join(P.processed, 'proxy_overhead_summary.csv'));

  // --- Scenario duration distribution (ms) ---
  const durations = nums(scenarioDurations, 'duration_ms');
  records.push({
    metric_category: CATEGORY,
    metric_name: 'scenario_duration_ms',
    metric_value: valOrNA(mean(durations)),
    metric_unit: 'ms',
    source_file: 'metrics/processed/scenario_durations.csv (mean of duration_ms)',
  });
  for (const [name, p] of [
    ['p50_scenario_duration_ms', 50],
    ['p95_scenario_duration_ms', 95],
    ['p99_scenario_duration_ms', 99],
  ] as const) {
    records.push({
      metric_category: CATEGORY,
      metric_name: name,
      metric_value: valOrNA(percentile(durations, p)),
      metric_unit: 'ms',
      source_file: `metrics/processed/scenario_durations.csv (p${p} of duration_ms)`,
    });
  }

  // --- Workflow / job durations from manifest startedAt/endedAt ---
  const manifests = loadManifests();
  const spans = manifests
    .filter((m) => m.startedAt && m.endedAt)
    .map((m) => {
      const s = Date.parse(m.startedAt as string);
      const e = Date.parse(m.endedAt as string);
      return { runId: m.runId, started: s, ended: e, ms: e - s };
    })
    .filter((x) => Number.isFinite(x.started) && Number.isFinite(x.ended) && x.ms >= 0);

  // workflow_duration_ms: max(ended) - min(started) across all manifests with both stamps.
  let workflowMs: number | string = NA;
  if (spans.length > 0) {
    const minStart = Math.min(...spans.map((x) => x.started));
    const maxEnd = Math.max(...spans.map((x) => x.ended));
    workflowMs = round2(maxEnd - minStart) as number;
  }
  records.push({
    metric_category: CATEGORY,
    metric_name: 'workflow_duration_ms',
    metric_value: workflowMs,
    metric_unit: 'ms',
    source_file: 'metrics/raw/run-manifest/*.json (max endedAt - min startedAt)',
  });

  // job_duration_ms: per-manifest ended-started. Emit a single ALL summary (mean) or NA.
  records.push({
    metric_category: CATEGORY,
    metric_name: 'job_duration_ms',
    metric_value: spans.length > 0 ? (round2(mean(spans.map((x) => x.ms)) as number) as number) : NA,
    metric_unit: 'ms',
    source_file: 'metrics/raw/run-manifest/*.json (mean per-manifest endedAt - startedAt)',
  });

  // --- Not measured upstream ---
  records.push({
    metric_category: CATEGORY,
    metric_name: 'tool_startup_duration_ms',
    metric_value: NA,
    metric_unit: 'ms',
    source_file: 'not measured upstream',
  });
  records.push({
    metric_category: CATEGORY,
    metric_name: 'telemetry_processing_duration_ms',
    metric_value: NA,
    metric_unit: 'ms',
    source_file: 'not measured upstream',
  });

  // --- TOM-only overhead (null for a future gTAA baseline) ---
  const proxyMean = mean(nums(proxyOverhead, 'avg_proxy_overhead_ms'));
  const grpcMean = mean(nums(proxyOverhead, 'avg_grpc_latency_ms'));
  records.push({
    metric_category: CATEGORY,
    metric_name: 'proxy_overhead_ms',
    metric_value: valOrNA(proxyMean),
    metric_unit: 'ms',
    source_file: 'TOM-only overhead',
  });
  records.push({
    metric_category: CATEGORY,
    metric_name: 'grpc_or_ipc_latency_ms',
    metric_value: valOrNA(grpcMean),
    metric_unit: 'ms',
    source_file: 'TOM-only overhead',
  });

  writeQualityCsv(join(P.processed, 'performance_efficiency_metrics.csv'), records);
  console.log(`[measure-performance-efficiency] wrote ${records.length} records`);
}

safeMain('measure-performance-efficiency', main);
