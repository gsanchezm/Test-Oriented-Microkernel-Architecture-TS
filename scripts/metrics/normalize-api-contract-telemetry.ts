// Normalizes API contract telemetry (ApiContractTelemetryEvent) into a flat CSV.
// Source: metrics/raw/api/*.jsonl (one row per event).
// Columns: COMMON_COLUMNS(tool_name='api',platform='api') + feature,endpoint_id,method,path,
//          response_status,response_time_ms,duration_ms,assertion_count,failed_assertions,extracted_keys_count
import { join } from 'path';
import { safeMain } from './lib/run';
import { P } from './lib/paths';
import { COMMON_COLUMNS, commonColumns, loadManifests, indexByRunId } from './lib/manifest';
import { writeCsv } from './lib/csv';
import { readJsonl } from './lib/jsonl';
import { listFiles } from './lib/discover';
import type { ApiContractTelemetryEvent } from '../../src/core/contracts/contract-telemetry.types';

const COLUMNS = [
  ...COMMON_COLUMNS,
  'feature',
  'endpoint_id',
  'method',
  'path',
  'response_status',
  'response_time_ms',
  'duration_ms',
  'assertion_count',
  'failed_assertions',
  'extracted_keys_count',
];

safeMain('normalize-api-contract-telemetry', () => {
  const idx = indexByRunId(loadManifests());
  const rows: Array<Record<string, unknown>> = [];

  for (const file of listFiles(P.rawApi, '.jsonl')) {
    for (const rec of readJsonl(file)) {
      const e = rec as ApiContractTelemetryEvent;
      if (!e || typeof e !== 'object') continue;
      const runId = typeof e.runId === 'string' ? e.runId : '';
      rows.push({
        ...commonColumns(runId, idx),
        tool_name: 'api',
        platform: 'api',
        status: e.status ?? 'UNKNOWN',
        feature: e.feature ?? '',
        endpoint_id: e.endpointId ?? '',
        method: e.method ?? '',
        path: e.path ?? '',
        response_status: e.responseStatus ?? '',
        response_time_ms: e.responseTimeMs ?? '',
        duration_ms: e.durationMs ?? '',
        assertion_count: e.assertionCount ?? '',
        failed_assertions: e.failedAssertions ?? '',
        extracted_keys_count: Array.isArray(e.extractedKeys) ? e.extractedKeys.length : '',
      });
    }
  }

  writeCsv(join(P.processed, 'api_isolated_results.csv'), COLUMNS, rows);
  console.log(`[normalize-api-contract-telemetry] ${rows.length} rows`);
});
