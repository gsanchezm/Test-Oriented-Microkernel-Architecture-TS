// Architecture-quality: Observability metrics for the TOM automation architecture.
// Evaluates how observable the test automation pipeline is (telemetry volume/completeness,
// classification coverage, and artifact/upload presence). Repo-level (tool_name/platform = 'ALL').
//
// ts-node CommonJS, bare relative imports, no extensions, no '@' aliases.
import { join } from 'path';
import { existsSync, statSync } from 'fs';
import { writeQualityCsv, QualityRecord, safeMain, NA } from './lib/quality';
import { P, walk, relPosix } from './lib/paths';
import { listFiles } from './lib/discover';
import { readCsv, round2 } from './lib/csv';
import { readJsonl } from './lib/jsonl';
import { loadManifests, indexByRunId } from './lib/manifest';

const CATEGORY = 'Observability';

/** Does a directory contain at least one real file (recursively), ignoring .gitkeep? */
function hasRealFile(dir: string): boolean {
  if (!existsSync(dir)) return false;
  return walk(dir).some((f) => !f.endsWith('.gitkeep'));
}

function main(): void {
  const records: QualityRecord[] = [];

  // --- Telemetry events: all records across metrics/raw/tool-events/*.jsonl ---
  const toolEventFiles = listFiles(P.rawToolEvents, '.jsonl');
  const toolEvents = toolEventFiles.flatMap((f) => readJsonl(f)) as Array<Record<string, unknown>>;
  const telemetryEventCount = toolEvents.length;
  const toolEventsSource =
    toolEventFiles.length > 0 ? relPosix(P.rawToolEvents) : `${relPosix(P.rawToolEvents)} (none)`;

  records.push({
    metric_category: CATEGORY,
    metric_name: 'telemetry_event_count',
    metric_value: telemetryEventCount,
    metric_unit: 'count',
    source_file: toolEventsSource,
  });

  // --- Telemetry completeness: records with all of {scenario,status,durationMs} ---
  const hasField = (e: Record<string, unknown>, k: string): boolean =>
    e[k] !== undefined && e[k] !== null && String(e[k]).trim() !== '';
  let completenessValue: string | number = NA;
  if (telemetryEventCount > 0) {
    const complete = toolEvents.filter(
      (e) => hasField(e, 'scenario') && hasField(e, 'status') && hasField(e, 'durationMs'),
    ).length;
    completenessValue = round2((complete / telemetryEventCount) * 100) ?? NA;
  }
  records.push({
    metric_category: CATEGORY,
    metric_name: 'telemetry_completeness_percentage',
    metric_value: completenessValue,
    metric_unit: 'percent',
    source_file: toolEventsSource,
  });

  // --- Missing run manifest count: distinct run_ids in processed CSVs absent from manifests ---
  const manifests = loadManifests();
  const manifestIdx = indexByRunId(manifests);
  const processedCsvs = listFiles(P.processed, '.csv');
  let missingManifestCount: string | number = 0; // 0 if no CSVs (per spec)
  if (processedCsvs.length > 0) {
    const runIds = new Set<string>();
    for (const csv of processedCsvs) {
      for (const row of readCsv(csv)) {
        const rid = row.run_id;
        if (rid && rid.trim() !== '' && rid !== 'UNKNOWN') runIds.add(rid);
      }
    }
    missingManifestCount = [...runIds].filter((rid) => !manifestIdx.has(rid)).length;
  }
  records.push({
    metric_category: CATEGORY,
    metric_name: 'missing_run_manifest_count',
    metric_value: missingManifestCount,
    metric_unit: 'count',
    source_file:
      processedCsvs.length > 0 ? relPosix(P.processed) : `${relPosix(P.processed)} (no csvs)`,
  });

  // --- Missing scenario duration count: scenarios in outcome history with no duration row ---
  const outcomePath = join(P.processed, 'scenario_outcome_history.csv');
  const durationsPath = join(P.processed, 'scenario_durations.csv');
  const outcomes = readCsv(outcomePath);
  const durations = readCsv(durationsPath);
  const durationKeys = new Set(
    durations.map((d) => `${d.run_id}||${d.feature}||${d.scenario}`),
  );
  const missingDurationCount = outcomes.filter(
    (o) => !durationKeys.has(`${o.run_id}||${o.feature}||${o.scenario}`),
  ).length;
  records.push({
    metric_category: CATEGORY,
    metric_name: 'missing_scenario_duration_count',
    metric_value: missingDurationCount,
    metric_unit: 'count',
    source_file: relPosix(outcomePath),
  });

  // --- Failure-bucket metrics from failure_buckets.csv ---
  const bucketsPath = join(P.processed, 'failure_buckets.csv');
  const bucketsExist = existsSync(bucketsPath);
  const buckets = readCsv(bucketsPath);
  const failingRows = buckets.filter((b) => (b.status || '').toUpperCase() === 'FAIL');

  let missingBucketCount: string | number = NA; // NA if file missing
  if (bucketsExist) {
    missingBucketCount = failingRows.filter(
      (b) => !b.failure_bucket || b.failure_bucket.trim() === '',
    ).length;
  }
  records.push({
    metric_category: CATEGORY,
    metric_name: 'missing_failure_bucket_count',
    metric_value: missingBucketCount,
    metric_unit: 'count',
    source_file: bucketsExist ? relPosix(bucketsPath) : `${relPosix(bucketsPath)} (missing)`,
  });

  let classifiedPct: string | number = NA;
  let unclassifiedPct: string | number = NA;
  if (failingRows.length > 0) {
    const classified = failingRows.filter(
      (b) => b.failure_bucket && b.failure_bucket.trim() !== '',
    ).length;
    const pct = round2((classified / failingRows.length) * 100);
    if (pct !== null) {
      classifiedPct = pct;
      unclassifiedPct = round2(100 - pct) ?? NA;
    }
  }
  records.push({
    metric_category: CATEGORY,
    metric_name: 'classified_failure_percentage',
    metric_value: classifiedPct,
    metric_unit: 'percent',
    source_file: bucketsExist ? relPosix(bucketsPath) : `${relPosix(bucketsPath)} (missing)`,
  });
  records.push({
    metric_category: CATEGORY,
    metric_name: 'unclassified_failure_percentage',
    metric_value: unclassifiedPct,
    metric_unit: 'percent',
    source_file: bucketsExist ? relPosix(bucketsPath) : `${relPosix(bucketsPath)} (missing)`,
  });

  // --- Upload/presence booleans (0/1) ---
  const logsUploaded = hasRealFile(P.logs) ? 1 : 0;
  records.push({
    metric_category: CATEGORY,
    metric_name: 'logs_uploaded',
    metric_value: logsUploaded,
    metric_unit: 'boolean',
    source_file: relPosix(P.logs),
  });

  const artifactsUploaded = hasRealFile(P.metrics) ? 1 : 0;
  records.push({
    metric_category: CATEGORY,
    metric_name: 'artifacts_uploaded',
    metric_value: artifactsUploaded,
    metric_unit: 'boolean',
    source_file: relPosix(P.metrics),
  });

  const rawRoot = join(P.metrics, 'raw');
  const rawUploaded = hasRealFile(rawRoot) ? 1 : 0;
  records.push({
    metric_category: CATEGORY,
    metric_name: 'raw_metrics_uploaded',
    metric_value: rawUploaded,
    metric_unit: 'boolean',
    source_file: relPosix(rawRoot),
  });

  const processedUploaded = processedCsvs.length > 0 ? 1 : 0;
  records.push({
    metric_category: CATEGORY,
    metric_name: 'processed_metrics_uploaded',
    metric_value: processedUploaded,
    metric_unit: 'boolean',
    source_file: relPosix(P.processed),
  });

  writeQualityCsv(join(P.processed, 'observability_metrics.csv'), records);
  console.log(`[measure-observability] wrote ${records.length} metrics`);
}

safeMain('measure-observability', main);
