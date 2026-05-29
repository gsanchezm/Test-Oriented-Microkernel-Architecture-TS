// Normalizes visual contract telemetry (VisualContractTelemetryEvent) into a flat CSV.
// Source: metrics/raw/visual/*.jsonl (one row per event).
// Columns: COMMON_COLUMNS(tool_name='pixelmatch', platform from event/manifest) + feature,snapshot_id,
//          baseline_path,actual_path,diff_path,diff_pixels,diff_ratio,threshold,passed
import { join } from 'path';
import { safeMain } from './lib/run';
import { P } from './lib/paths';
import { COMMON_COLUMNS, commonColumns, loadManifests, indexByRunId } from './lib/manifest';
import { writeCsv } from './lib/csv';
import { readJsonl } from './lib/jsonl';
import { listFiles } from './lib/discover';
import type { VisualContractTelemetryEvent } from '../../src/core/contracts/contract-telemetry.types';

const COLUMNS = [
  ...COMMON_COLUMNS,
  'feature',
  'snapshot_id',
  'baseline_path',
  'actual_path',
  'diff_path',
  'diff_pixels',
  'diff_ratio',
  'threshold',
  'passed',
];

safeMain('normalize-visual-contract-telemetry', () => {
  const idx = indexByRunId(loadManifests());
  const rows: Array<Record<string, unknown>> = [];

  for (const file of listFiles(P.rawVisual, '.jsonl')) {
    for (const rec of readJsonl(file)) {
      const e = rec as VisualContractTelemetryEvent;
      if (!e || typeof e !== 'object') continue;
      const runId = typeof e.runId === 'string' ? e.runId : '';
      const common = commonColumns(runId, idx);
      rows.push({
        ...common,
        tool_name: 'pixelmatch',
        // Platform comes from the event when present, otherwise the manifest/env value.
        platform: e.platform ?? common.platform,
        status: e.status ?? 'UNKNOWN',
        feature: e.feature ?? '',
        snapshot_id: e.snapshotId ?? '',
        baseline_path: e.baselinePath ?? '',
        actual_path: e.actualPath ?? '',
        diff_path: e.diffPath ?? '',
        diff_pixels: e.diffPixels ?? '',
        diff_ratio: e.diffRatio ?? '',
        threshold: e.threshold ?? '',
        passed: e.passed ?? '',
      });
    }
  }

  writeCsv(join(P.processed, 'visual_comparison_results.csv'), COLUMNS, rows);
  console.log(`[normalize-visual-contract-telemetry] ${rows.length} rows`);
});
