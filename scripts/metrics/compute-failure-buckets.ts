// Classifies every FAILING execution unit into a standardized failure bucket.
// Sources: tool-events JSONL, cucumber JSONL, API contract JSONL (status FAIL),
// visual contract JSONL (passed===false). Emits ONLY failing rows.
// No kernel/emitter changes — reads what already lands in metrics/raw/**.
import { safeMain } from './lib/run';
import { P, relPosix, ensureDir } from './lib/paths';
import { listFiles } from './lib/discover';
import { readJsonl } from './lib/jsonl';
import { loadManifests, indexByRunId, commonColumns } from './lib/manifest';
import { classifyFailure } from './lib/failure-buckets';
import { writeCsv } from './lib/csv';
import { join, basename } from 'path';

// EXACT column order per spec §14 — NOT the COMMON_COLUMNS order.
const COLUMNS = [
  'architecture_type',
  'repository_name',
  'experiment_batch_id',
  'run_index',
  'workflow_run_id',
  'workflow_attempt',
  'tool_name',
  'platform',
  'viewport',
  'run_id',
  'feature',
  'scenario',
  'step',
  'status',
  'failure_bucket',
  'error_message',
  'source_file',
  'generated_at',
];

interface FailingUnit {
  runId: string; // from filename basename — matches manifest keys
  feature: string;
  scenario: string;
  step: string;
  status: string;
  errorMessage: string | null;
  toolName?: string;
  platform?: string;
  sourceFile: string; // repo-relative posix
}

function str(v: unknown): string {
  return v === null || v === undefined ? '' : String(v);
}

function strOrNull(v: unknown): string | null {
  return v === null || v === undefined ? null : String(v);
}

function isFail(status: unknown): boolean {
  return String(status).toUpperCase() === 'FAIL';
}

function sanitize(msg: string | null): string {
  if (!msg) return '';
  return msg.replace(/[\r\n]+/g, ' ').slice(0, 500);
}

/** runId from a `<runId>.jsonl` file path. */
function runIdFromFile(file: string): string {
  const b = basename(file);
  return b.endsWith('.jsonl') ? b.slice(0, -'.jsonl'.length) : b;
}

safeMain('compute-failure-buckets', () => {
  const idx = indexByRunId(loadManifests());
  const units: FailingUnit[] = [];

  // 1) tool-events JSONL — per-step events.
  for (const file of listFiles(P.rawToolEvents, '.jsonl')) {
    const runId = runIdFromFile(file);
    const src = relPosix(file);
    for (const raw of readJsonl(file)) {
      const r = raw as Record<string, unknown>;
      if (!isFail(r.status)) continue;
      units.push({
        runId,
        feature: str(r.feature),
        scenario: str(r.scenario),
        step: str(r.step ?? r.name ?? r.stepName),
        status: 'FAIL',
        errorMessage: strOrNull(r.errorMessage ?? r.error ?? r.message),
        toolName: r.toolName ? String(r.toolName) : undefined,
        platform: r.platform ? String(r.platform) : undefined,
        sourceFile: src,
      });
    }
  }

  // 2) cucumber JSONL — scenario records carrying a steps array.
  for (const file of listFiles(P.rawCucumberJsonl, '.jsonl')) {
    const runId = runIdFromFile(file);
    const src = relPosix(file);
    for (const raw of readJsonl(file)) {
      const r = raw as Record<string, unknown>;
      const steps = Array.isArray(r.steps) ? (r.steps as Array<Record<string, unknown>>) : [];
      const failingSteps = steps.filter((s) => isFail(s.status));
      if (failingSteps.length > 0) {
        for (const s of failingSteps) {
          units.push({
            runId,
            feature: str(r.feature),
            scenario: str(r.scenario),
            step: str(s.name ?? s.step),
            status: 'FAIL',
            errorMessage: strOrNull(s.errorMessage ?? s.error ?? s.message),
            platform: r.platform ? String(r.platform) : undefined,
            sourceFile: src,
          });
        }
      } else if (isFail(r.status)) {
        // Scenario failed with no per-step detail.
        units.push({
          runId,
          feature: str(r.feature),
          scenario: str(r.scenario),
          step: '',
          status: 'FAIL',
          errorMessage: strOrNull(r.errorMessage ?? r.error ?? r.message),
          platform: r.platform ? String(r.platform) : undefined,
          sourceFile: src,
        });
      }
    }
  }

  // 3) API contract JSONL — status FAIL.
  for (const file of listFiles(P.rawApi, '.jsonl')) {
    const runId = runIdFromFile(file);
    const src = relPosix(file);
    for (const raw of readJsonl(file)) {
      const r = raw as Record<string, unknown>;
      if (!isFail(r.status)) continue;
      units.push({
        runId,
        feature: str(r.feature),
        scenario: str(r.scenario ?? r.endpointId ?? r.contractId),
        step: str(r.endpointId ?? ''),
        status: 'FAIL',
        errorMessage: strOrNull(r.errorMessage),
        toolName: 'api',
        platform: r.platform ? String(r.platform) : 'api',
        sourceFile: src,
      });
    }
  }

  // 4) Visual contract JSONL — passed===false.
  for (const file of listFiles(P.rawVisual, '.jsonl')) {
    const runId = runIdFromFile(file);
    const src = relPosix(file);
    for (const raw of readJsonl(file)) {
      const r = raw as Record<string, unknown>;
      if (r.passed !== false) continue;
      // Synthesize a message the classifier can route. A missing baseline path
      // means the baseline is absent; otherwise treat as a visual drift.
      const hasBaseline =
        r.baselinePath !== null && r.baselinePath !== undefined && String(r.baselinePath).trim() !== '';
      const synthetic = hasBaseline ? 'visual drift (diff pixels)' : 'baseline missing';
      const existing = strOrNull(r.errorMessage);
      units.push({
        runId,
        feature: str(r.feature),
        scenario: str(r.scenario ?? r.snapshotId ?? r.contractId),
        step: str(r.snapshotId ?? ''),
        status: 'FAIL',
        errorMessage: existing && existing.trim() !== '' ? existing : synthetic,
        toolName: 'pixelmatch',
        platform: r.platform ? String(r.platform) : undefined,
        sourceFile: src,
      });
    }
  }

  const rows = units.map((u) => {
    const cc = commonColumns(u.runId, idx);
    const bucket = classifyFailure(u.status, u.errorMessage, {
      toolName: u.toolName ?? cc.tool_name,
      platform: u.platform ?? cc.platform,
      step: u.step,
    });
    return {
      architecture_type: cc.architecture_type,
      repository_name: cc.repository_name,
      experiment_batch_id: cc.experiment_batch_id,
      run_index: cc.run_index,
      workflow_run_id: cc.workflow_run_id,
      workflow_attempt: cc.workflow_attempt,
      tool_name: u.toolName ?? cc.tool_name,
      platform: u.platform ?? cc.platform,
      viewport: cc.viewport,
      run_id: cc.run_id,
      feature: u.feature,
      scenario: u.scenario,
      step: u.step,
      status: 'FAIL',
      failure_bucket: bucket ?? '',
      error_message: sanitize(u.errorMessage),
      source_file: u.sourceFile,
      generated_at: cc.timestamp, // manifest generatedAt or 'UNKNOWN'
    };
  });

  ensureDir(P.processed);
  const out = join(P.processed, 'failure_buckets.csv');
  writeCsv(out, COLUMNS, rows);
  console.log(`[compute-failure-buckets] wrote ${relPosix(out)} (${rows.length} failing rows)`);
});
