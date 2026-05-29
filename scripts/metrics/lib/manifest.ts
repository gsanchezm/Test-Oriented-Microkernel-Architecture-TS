// Loads run manifests and provides the common experimental columns for any run id.
// The manifest is the single source of experimental identity; processors stamp these
// columns onto every output row, joined by run_id. Falls back to env context, then UNKNOWN.
import { P } from './paths';
import { listFiles } from './discover';
import { readJsonFile } from './jsonl';
import { resolveExperimentContext } from './env';

export interface RunManifest {
  schemaVersion: string;
  runId: string;
  architectureType: string;
  experimentBatchId: string;
  runIndex: string;
  repositoryName: string | null;
  workflowName: string | null;
  workflowRunId: string | null;
  workflowAttempt: string | null;
  jobName: string | null;
  toolName: string | null;
  platform: string;
  viewport: string | null;
  driver: string | null;
  commitSha: string | null;
  branch: string | null;
  generatedAt: string;
  startedAt: string | null;
  endedAt: string | null;
  os: string | null;
  nodeVersion: string | null;
  environment: string | null;
}

export const COMMON_COLUMNS = [
  'architecture_type',
  'repository_name',
  'experiment_batch_id',
  'run_index',
  'workflow_run_id',
  'workflow_attempt',
  'job_name',
  'tool_name',
  'platform',
  'viewport',
  'run_id',
  'commit_sha',
  'branch',
  'timestamp',
  'status',
] as const;

export function loadManifests(dir: string = P.rawManifest): RunManifest[] {
  return listFiles(dir, '.json')
    .map((f) => readJsonFile<RunManifest>(f))
    .filter((m): m is RunManifest => m !== null && typeof m.runId === 'string');
}

export function indexByRunId(manifests: RunManifest[]): Map<string, RunManifest> {
  const idx = new Map<string, RunManifest>();
  for (const m of manifests) idx.set(m.runId, m);
  return idx;
}

const orUnknown = (v: unknown): string =>
  v === null || v === undefined || String(v).trim() === '' ? 'UNKNOWN' : String(v);

/**
 * Common experimental columns for a run id. Uses the matching manifest when present,
 * otherwise the live env context. `status`/`timestamp` are left for the caller to override per row.
 */
export function commonColumns(
  runId: string,
  idx: Map<string, RunManifest>,
): Record<string, string> {
  const m = idx.get(runId);
  if (m) {
    return {
      architecture_type: orUnknown(m.architectureType),
      repository_name: orUnknown(m.repositoryName),
      experiment_batch_id: orUnknown(m.experimentBatchId),
      run_index: orUnknown(m.runIndex),
      workflow_run_id: orUnknown(m.workflowRunId),
      workflow_attempt: orUnknown(m.workflowAttempt),
      job_name: orUnknown(m.jobName),
      tool_name: orUnknown(m.toolName),
      platform: orUnknown(m.platform),
      viewport: orUnknown(m.viewport),
      run_id: runId,
      commit_sha: orUnknown(m.commitSha),
      branch: orUnknown(m.branch),
      timestamp: orUnknown(m.generatedAt),
      status: 'UNKNOWN',
    };
  }
  const ctx = resolveExperimentContext();
  return {
    architecture_type: ctx.architecture_type,
    repository_name: ctx.repository_name,
    experiment_batch_id: ctx.experiment_batch_id,
    run_index: ctx.run_index,
    workflow_run_id: ctx.workflow_run_id,
    workflow_attempt: ctx.workflow_attempt,
    job_name: ctx.job_name,
    tool_name: ctx.tool_name,
    platform: ctx.platform,
    viewport: ctx.viewport,
    run_id: runId || 'UNKNOWN',
    commit_sha: ctx.commit_sha,
    branch: ctx.branch,
    timestamp: 'UNKNOWN',
    status: 'UNKNOWN',
  };
}

/** Picks a representative manifest (first by run id) for repository-level summaries. */
export function representativeManifest(manifests: RunManifest[]): RunManifest | null {
  if (manifests.length === 0) return null;
  return [...manifests].sort((a, b) => a.runId.localeCompare(b.runId))[0];
}
