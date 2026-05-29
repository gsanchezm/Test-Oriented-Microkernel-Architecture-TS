// Writes one run manifest per job: metrics/raw/run-manifest/<runId>.json.
// The manifest is the single source of experimental identity for the run.
// Exits 1 ONLY when a run id cannot be produced; otherwise always succeeds.
import { writeFileSync } from 'fs';
import { join } from 'path';
import { P, ensureDir } from './lib/paths';
import { resolveExperimentContext, resolveRunId } from './lib/env';

const SCHEMA_VERSION = '1.0.0';

function main(): void {
  const ctx = resolveExperimentContext();
  const runId = resolveRunId(ctx.tool_name !== 'UNKNOWN' ? ctx.tool_name : undefined);
  if (!runId || runId.trim() === '') {
    console.error('[generate-run-manifest] FATAL: could not resolve a run id');
    process.exit(1);
  }

  const e = process.env;
  const nullable = (v?: string) => (v && v.trim() !== '' ? v : null);

  const manifest = {
    schemaVersion: SCHEMA_VERSION,
    runId,
    architectureType: ctx.architecture_type,
    experimentBatchId: ctx.experiment_batch_id,
    runIndex: ctx.run_index,
    repositoryName: nullable(ctx.repository_name === 'UNKNOWN' ? undefined : ctx.repository_name),
    workflowName: nullable(e.WORKFLOW_NAME || e.GITHUB_WORKFLOW),
    workflowRunId: nullable(ctx.workflow_run_id === 'UNKNOWN' ? undefined : ctx.workflow_run_id),
    workflowAttempt: nullable(ctx.workflow_attempt === 'UNKNOWN' ? undefined : ctx.workflow_attempt),
    jobName: nullable(ctx.job_name === 'UNKNOWN' ? undefined : ctx.job_name),
    toolName: nullable(ctx.tool_name === 'UNKNOWN' ? undefined : ctx.tool_name),
    platform: ctx.platform,
    viewport: nullable(ctx.viewport === 'UNKNOWN' ? undefined : ctx.viewport),
    driver: nullable(ctx.driver === 'UNKNOWN' ? undefined : ctx.driver),
    commitSha: nullable(ctx.commit_sha === 'UNKNOWN' ? undefined : ctx.commit_sha),
    branch: nullable(ctx.branch === 'UNKNOWN' ? undefined : ctx.branch),
    // Manifest generation is the ONE place a wall-clock timestamp is allowed.
    generatedAt: e.GENERATED_AT || new Date().toISOString(),
    startedAt: nullable(e.RUN_STARTED_AT),
    endedAt: nullable(e.RUN_ENDED_AT),
    ciProvider: e.GITHUB_ACTIONS === 'true' ? 'github' : null,
    ciRunId: nullable(e.GITHUB_RUN_ID),
    tags: [] as string[],
    os: ctx.os,
    nodeVersion: ctx.node_version,
    environment: ctx.environment,
  };

  ensureDir(P.rawManifest);
  const out = join(P.rawManifest, `${runId}.json`);
  writeFileSync(out, JSON.stringify(manifest, null, 2), 'utf8');
  console.log(`[generate-run-manifest] wrote ${out} (architectureType=${manifest.architectureType})`);
}

main();
