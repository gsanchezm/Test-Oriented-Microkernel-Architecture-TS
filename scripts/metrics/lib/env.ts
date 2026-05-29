// Resolves experimental identity from environment variables.
// architecture_type defaults to TOM. Missing values become 'UNKNOWN' (never fabricated).

export interface ExperimentContext {
  architecture_type: string;
  repository_name: string;
  experiment_batch_id: string;
  run_index: string;
  workflow_run_id: string;
  workflow_attempt: string;
  job_name: string;
  tool_name: string;
  platform: string;
  viewport: string;
  driver: string;
  commit_sha: string;
  branch: string;
  os: string;
  node_version: string;
  environment: string;
}

const pick = (...vals: Array<string | undefined>): string => {
  for (const v of vals) {
    if (v !== undefined && v !== null && String(v).trim() !== '') return String(v);
  }
  return 'UNKNOWN';
};

export function resolveExperimentContext(): ExperimentContext {
  const e = process.env;
  return {
    architecture_type: pick(e.ARCHITECTURE_TYPE, 'TOM'),
    repository_name: pick(e.REPOSITORY_NAME, e.GITHUB_REPOSITORY),
    experiment_batch_id: pick(e.EXPERIMENT_BATCH_ID, 'batch-adhoc'),
    run_index: pick(e.RUN_INDEX, e.GITHUB_RUN_ATTEMPT),
    workflow_run_id: pick(e.WORKFLOW_RUN_ID, e.GITHUB_RUN_ID),
    workflow_attempt: pick(e.WORKFLOW_ATTEMPT, e.GITHUB_RUN_ATTEMPT),
    job_name: pick(e.JOB_NAME, e.GITHUB_JOB),
    tool_name: pick(e.TOOL_NAME),
    platform: pick(e.PLATFORM),
    viewport: pick(e.VIEWPORT),
    driver: pick(e.DRIVER),
    commit_sha: pick(e.COMMIT_SHA, e.GITHUB_SHA),
    branch: pick(e.BRANCH_NAME, e.GITHUB_REF_NAME),
    os: process.platform,
    node_version: process.version,
    environment: pick(e.ENVIRONMENT, e.NODE_ENV),
  };
}

/**
 * Run id rule: TOM_RUN_ID if set, otherwise
 * tom-<github_run_id|local>-<github_run_attempt|1>-<tool>-<timestamp>.
 * `ts` is injected for determinism in tests; defaults to a wall-clock stamp (only used when TOM_RUN_ID is absent).
 */
export function resolveRunId(toolName?: string, ts?: string): string {
  const explicit = process.env.TOM_RUN_ID;
  if (explicit && explicit.trim() !== '') return explicit;
  const runId = process.env.GITHUB_RUN_ID || 'local';
  const attempt = process.env.GITHUB_RUN_ATTEMPT || '1';
  const tool = toolName || process.env.TOOL_NAME || 'tool';
  const stamp = ts || new Date().toISOString().replace(/[:.]/g, '-');
  return `tom-${runId}-${attempt}-${tool}-${stamp}`;
}

/**
 * Stable run id for processors that must mint an id for derived-raw output when the source data
 * carries none (e.g. proxy logs). Unlike resolveRunId(), this NEVER uses a wall-clock stamp, so
 * reprocessing identical inputs is byte-reproducible. In CI TOM_RUN_ID is always set.
 */
export function resolveStableRunId(label = 'local'): string {
  const explicit = process.env.TOM_RUN_ID;
  if (explicit && explicit.trim() !== '') return explicit;
  return `tom-${label}`;
}

/**
 * Deterministic 'generated_at' for row bodies. Prefers GENERATED_AT env, then the supplied fallback
 * (e.g. a manifest's generatedAt), then 'UNKNOWN'. Never calls Date.now() so reruns stay reproducible.
 */
export function resolveGeneratedAt(fallback?: string): string {
  return pick(process.env.GENERATED_AT, fallback);
}
