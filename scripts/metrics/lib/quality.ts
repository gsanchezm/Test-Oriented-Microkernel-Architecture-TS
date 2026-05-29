// Shared helpers for the architecture-quality (measure-*) scripts.
// Stamps experiment context + generated_at onto each QualityRecord and writes the CSV.
import { writeCsv } from './csv';
import { resolveExperimentContext, resolveGeneratedAt } from './env';
import { representativeManifest, loadManifests } from './manifest';

export { safeMain, NA } from './run';

export interface QualityRecord {
  metric_category: string;
  metric_name: string;
  metric_value: string | number | null; // null -> '' ; 'NOT_AVAILABLE' / 'UNKNOWN' allowed
  metric_unit: string;
  tool_name?: string; // defaults 'ALL'
  platform?: string; // defaults 'ALL'
  viewport?: string; // defaults 'ALL'
  source_file: string;
}

export const QUALITY_COLUMNS = [
  'architecture_type',
  'repository_name',
  'experiment_batch_id',
  'run_index',
  'workflow_run_id',
  'workflow_attempt',
  'tool_name',
  'platform',
  'viewport',
  'metric_category',
  'metric_name',
  'metric_value',
  'metric_unit',
  'source_file',
  'generated_at',
] as const;

/**
 * Writes quality records with experiment context + generated_at stamped on.
 * Context comes from a representative run manifest when available, else env vars.
 */
export function writeQualityCsv(absPath: string, records: QualityRecord[]): void {
  const ctx = resolveExperimentContext();
  const manifest = representativeManifest(loadManifests());
  const generated_at = resolveGeneratedAt(manifest?.generatedAt);

  const architecture_type = manifest?.architectureType || ctx.architecture_type;
  const repository_name = manifest?.repositoryName || ctx.repository_name;
  const experiment_batch_id = manifest?.experimentBatchId || ctx.experiment_batch_id;
  const run_index = manifest?.runIndex || ctx.run_index;
  const workflow_run_id = manifest?.workflowRunId || ctx.workflow_run_id;
  const workflow_attempt = manifest?.workflowAttempt || ctx.workflow_attempt;

  const rows = records.map((r) => ({
    architecture_type,
    repository_name,
    experiment_batch_id,
    run_index,
    workflow_run_id,
    workflow_attempt,
    tool_name: r.tool_name ?? 'ALL',
    platform: r.platform ?? 'ALL',
    viewport: r.viewport ?? 'ALL',
    metric_category: r.metric_category,
    metric_name: r.metric_name,
    metric_value: r.metric_value,
    metric_unit: r.metric_unit,
    source_file: r.source_file,
    generated_at,
  }));

  writeCsv(absPath, [...QUALITY_COLUMNS], rows);
}

