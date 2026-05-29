# TOM Quantitative Metrics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the TOM repository emit objective, reproducible quantitative metrics (operational + architecture-quality) tagged `architecture_type = TOM`, plus a CI workflow that produces them on every run, without changing the kernel, proxy, plugins, contracts, locator resolver, or feature behavior.

**Architecture:** A run manifest per job carries all experimental identity. A shared `scripts/metrics/lib/` provides env/manifest/CSV/failure-bucket helpers. Independent processor scripts read raw telemetry (already emitted to `metrics/raw/`) + repo/git evidence and write deterministic CSVs to `metrics/processed/`, then summary builders emit article tables. A new `tom-quantitative-execution.yml` workflow runs the suite tool-by-tool and uploads `tom-metrics-*` artifacts with `if: always()`.

**Tech Stack:** TypeScript via `ts-node -r tsconfig-paths/register` (NO build step — CLAUDE.md), Node 22, pnpm, GitHub Actions, Cucumber JSON reports, existing contract/proxy/gatling telemetry.

**Spec:** `docs/superpowers/specs/2026-05-28-tom-quantitative-metrics-design.md`

---

## File Structure

### Shared foundation (Phase 0 — build first, serially)
- `metrics/schemas/run-manifest.schema.json` — **modify** (additive experimental fields)
- `metrics/schemas/experiment-record.schema.json` — **create** (common CSV columns)
- `metrics/schemas/quality-attribute-metric.schema.json` — **create**
- `scripts/metrics/lib/paths.ts` — repo-root + canonical paths
- `scripts/metrics/lib/env.ts` — run-id + experiment-context resolution
- `scripts/metrics/lib/manifest.ts` — load/index/enrich from run manifests
- `scripts/metrics/lib/csv.ts` — deterministic CSV writer/reader
- `scripts/metrics/lib/failure-buckets.ts` — classifier + enum
- `scripts/metrics/lib/jsonl.ts` — tolerant JSONL reader
- `scripts/metrics/lib/discover.ts` — glob raw inputs by run id
- `scripts/metrics/generate-run-manifest.ts` — writes `metrics/raw/run-manifest/<id>.json`

### Operational processors (Phase 1 — parallel, each its own file)
- `scripts/metrics/extract-scenario-inventory.ts`
- `scripts/metrics/build-platform-coverage.ts`
- `scripts/metrics/normalize-telemetry.ts`
- `scripts/metrics/aggregate-durations.ts`
- `scripts/metrics/normalize-api-contract-telemetry.ts`
- `scripts/metrics/normalize-visual-contract-telemetry.ts`
- `scripts/metrics/normalize-gatling-summary.ts`
- `scripts/metrics/compute-failure-buckets.ts`
- `scripts/metrics/compute-proxy-overhead.ts`
- `scripts/metrics/build-article-tables.ts`

### Quality processors (Phase 2 — parallel, each its own file)
- `scripts/metrics/lib/quality.ts` — quality-record builder + writer (shared by all measure-*)
- `scripts/metrics/measure-maintainability.ts`
- `scripts/metrics/measure-modifiability.ts`
- `scripts/metrics/measure-extensibility.ts`
- `scripts/metrics/measure-reusability.ts`
- `scripts/metrics/measure-reliability.ts`
- `scripts/metrics/measure-performance-efficiency.ts`
- `scripts/metrics/measure-observability.ts`
- `scripts/metrics/measure-portability.ts`
- `scripts/metrics/measure-interoperability.ts`
- `scripts/metrics/build-quality-attribute-summary.ts`

### CI + scripts (Phase 3)
- `.github/workflows/tom-quantitative-execution.yml` — **create**
- `.github/workflows/update-visual-baselines.yml` — **modify** (add TOM env)
- `package.json` — **modify** (scripts only)

### Docs (Phase 4 — parallel)
- `docs/research/tom-quantitative-protocol.md`
- `docs/research/metrics-protocol.md`
- `docs/research/quality-attribute-measurement-model.md`
- `docs/architecture/tom-experimental-architecture.md`

---

## SHARED CONTRACTS (authoritative — every script MUST conform)

### Common experimental columns (in this exact order, prepended to every operational CSV unless noted)
```
architecture_type,repository_name,experiment_batch_id,run_index,workflow_run_id,workflow_attempt,job_name,tool_name,platform,viewport,run_id,commit_sha,branch,timestamp,status
```

### `lib/env.ts` — exact API
```ts
export interface ExperimentContext {
  architecture_type: string;   // default 'TOM'
  repository_name: string;     // REPOSITORY_NAME ?? GITHUB_REPOSITORY ?? 'UNKNOWN'
  experiment_batch_id: string; // EXPERIMENT_BATCH_ID ?? 'batch-adhoc'
  run_index: string;           // RUN_INDEX ?? GITHUB_RUN_ATTEMPT ?? 'UNKNOWN'
  workflow_run_id: string;     // WORKFLOW_RUN_ID ?? GITHUB_RUN_ID ?? 'UNKNOWN'
  workflow_attempt: string;    // WORKFLOW_ATTEMPT ?? GITHUB_RUN_ATTEMPT ?? 'UNKNOWN'
  job_name: string;            // JOB_NAME ?? GITHUB_JOB ?? 'UNKNOWN'
  tool_name: string;           // TOOL_NAME ?? 'UNKNOWN'
  platform: string;            // PLATFORM ?? 'UNKNOWN'
  viewport: string;            // VIEWPORT ?? 'UNKNOWN'
  driver: string;              // DRIVER ?? 'UNKNOWN'
  commit_sha: string;          // COMMIT_SHA ?? GITHUB_SHA ?? 'UNKNOWN'
  branch: string;              // BRANCH_NAME ?? GITHUB_REF_NAME ?? 'UNKNOWN'
  os: string;                  // process.platform
  node_version: string;        // process.version
  environment: string;         // ENVIRONMENT ?? NODE_ENV ?? 'UNKNOWN'
}
export function resolveExperimentContext(): ExperimentContext;
// TOM_RUN_ID else `tom-${GITHUB_RUN_ID ?? 'local'}-${GITHUB_RUN_ATTEMPT ?? '1'}-${tool}-${ts}`
export function resolveRunId(toolName?: string, ts?: string): string;
// GENERATED_AT env (ISO) else manifest generatedAt else 'UNKNOWN' — NEVER Date.now() in row bodies
export function resolveGeneratedAt(fallback?: string): string;
```

### `lib/manifest.ts` — exact API
```ts
export interface RunManifest {
  schemaVersion: string; runId: string; architectureType: string;
  experimentBatchId: string; runIndex: string; repositoryName: string;
  workflowName: string; workflowRunId: string; workflowAttempt: string;
  jobName: string; toolName: string; platform: string; viewport: string;
  driver: string; commitSha: string; branch: string; generatedAt: string;
  startedAt: string | null; endedAt: string | null; os: string;
  nodeVersion: string; environment: string;
}
export function loadManifests(dir?: string): RunManifest[];      // default metrics/raw/run-manifest
export function indexByRunId(m: RunManifest[]): Map<string, RunManifest>;
// Returns the common-column object for a runId: manifest fields if present, else env context, else UNKNOWN.
export function commonColumns(runId: string, idx: Map<string, RunManifest>): Record<string, string>;
```

### `lib/csv.ts` — exact API
```ts
// Writes header + rows; if rows empty writes header only. Sorts rows by JSON.stringify for determinism.
// Quotes fields containing , " or newline; escapes " as "". Always ends with trailing newline.
export function writeCsv(absPath: string, columns: string[], rows: Array<Record<string, unknown>>): void;
export function readCsv(absPath: string): Array<Record<string, string>>;  // [] if file missing
export function toCell(v: unknown): string;  // null/undefined -> '' ; numbers -> String ; else String
```

### `lib/failure-buckets.ts` — exact API
```ts
export const FAILURE_BUCKETS = ['API_CONTRACT_FAILURE','API_RESPONSE_FAILURE','UI_ACTION_FAILURE',
 'LOCATOR_RESOLUTION_FAILURE','VISUAL_DIFF_FAILURE','VISUAL_BASELINE_MISSING','PERFORMANCE_THRESHOLD_FAILURE',
 'MOBILE_SESSION_FAILURE','WEB_SESSION_FAILURE','INFRASTRUCTURE_FAILURE','DATA_SETUP_FAILURE',
 'ASSERTION_FAILURE','TIMEOUT_FAILURE','UNKNOWN_FAILURE'] as const;
export type FailureBucket = typeof FAILURE_BUCKETS[number];
export interface ClassifyCtx { toolName?: string; platform?: string; step?: string; }
// status !== FAIL -> null. Otherwise regex/keyword match on errorMessage + ctx. Default UNKNOWN_FAILURE.
export function classifyFailure(status: string, errorMessage: string | null, ctx?: ClassifyCtx): FailureBucket | null;
```
Classification keyword rules (case-insensitive, first match wins):
`timeout|timed out`→TIMEOUT_FAILURE; `locator|selector|element not found|no node found`→LOCATOR_RESOLUTION_FAILURE;
`baseline missing|no baseline`→VISUAL_BASELINE_MISSING; `pixel|diff ratio|visual drift|snapshot`→VISUAL_DIFF_FAILURE;
`status code|response status|expected status|http`→API_RESPONSE_FAILURE; `schema|contract|assertion on body`→API_CONTRACT_FAILURE;
`session not created|appium|emulator|simulator|device`→MOBILE_SESSION_FAILURE; `browser|page crash|playwright|webdriver`→WEB_SESSION_FAILURE;
`threshold|p95|p99|response time exceeded`→PERFORMANCE_THRESHOLD_FAILURE; `econnrefused|ehostunreach|proxy|grpc|plugin not`→INFRASTRUCTURE_FAILURE;
`seed|fixture|setup|precondition|login failed`→DATA_SETUP_FAILURE; `expected|assert|to equal|to contain`→ASSERTION_FAILURE; else UNKNOWN_FAILURE.
Context overrides: if ctx.toolName==='api' and no stronger match → API_RESPONSE_FAILURE; appium/android/ios platform + session words → MOBILE_SESSION_FAILURE.

### `lib/quality.ts` — exact API (Phase 2 contract)
```ts
export interface QualityRecord {
  metric_category: string; metric_name: string;
  metric_value: string | number | null;  // null -> '' ; 'NOT_AVAILABLE'/'UNKNOWN' allowed
  metric_unit: string; tool_name: string; platform: string; viewport: string; source_file: string;
}
export const QUALITY_COLUMNS = ['architecture_type','repository_name','experiment_batch_id','run_index',
 'workflow_run_id','workflow_attempt','tool_name','platform','viewport','metric_category','metric_name',
 'metric_value','metric_unit','source_file','generated_at'] as const;
// Stamps experiment context + generated_at onto each record, writes CSV. category defaults tool/platform='ALL'.
export function writeQualityCsv(absPath: string, records: QualityRecord[]): void;
export function safeMain(fn: () => void): void;  // try/catch: log warning, still exit 0 on non-fatal
```

### Universal script skeleton (every processor uses this)
```ts
import { safeMain } from './lib/quality.ts is Phase2; operational uses inline try/catch';
// Operational scripts: wrap body in try/catch; on error console.warn(`[<script>] <msg>`) then write headers-only CSV and process.exit(0). Only generate-run-manifest exits 1 if runId cannot be produced.
```

---

## PHASE 0 — Foundation (serial; one worker)

### Task 0.1: Extend run-manifest schema
**Files:** Modify `metrics/schemas/run-manifest.schema.json`
- [ ] Add properties (keep all existing): `schemaVersion` (string), `architectureType` (string), `experimentBatchId` (string), `runIndex` (string), `repositoryName` (string), `workflowName` (string|null), `workflowRunId` (string|null), `workflowAttempt` (string|null), `jobName` (string|null), `toolName` (string|null), `startedAt` (string|null), `endedAt` (string|null). Add the new non-null ones to `required`. `additionalProperties: true`.
- [ ] Validate JSON parses: `node -e "JSON.parse(require('fs').readFileSync('metrics/schemas/run-manifest.schema.json','utf8'))"`

### Task 0.2: Create experiment-record + quality schemas
**Files:** Create `metrics/schemas/experiment-record.schema.json`, `metrics/schemas/quality-attribute-metric.schema.json`
- [ ] experiment-record: object with the 15 common columns (all string, status enum `PASS|FAIL|SKIP|UNKNOWN`), `additionalProperties: true`.
- [ ] quality-attribute-metric: object with the 15 QUALITY_COLUMNS, `additionalProperties: true`.
- [ ] Validate both parse.

### Task 0.3: Build `scripts/metrics/lib/*`
**Files:** Create the 7 lib files per the SHARED CONTRACTS above (paths, env, manifest, csv, failure-buckets, jsonl, discover). Use **relative imports** within `scripts/` (no `@` aliases — these run via ts-node from repo root; relative keeps them self-contained). `lib/paths.ts` exports `REPO_ROOT` (resolve from `__dirname` up to repo root) and `P` (object of canonical abs paths: `rawManifest`, `rawApi`, `rawVisual`, `rawGatling`, `rawProxyJsonl`, `rawCucumberJsonl`, `rawToolEvents`, `processed`, `summary`, `results`, `reports`, `logs`, `features`, `featuresGlob`).
- [ ] `lib/jsonl.ts`: `readJsonl(file): unknown[]` (skip blank + non-parseable lines), `readAllJsonl(files): unknown[]`.
- [ ] `lib/discover.ts`: `listRunIds(dir, ext)`, `globRaw(kind): string[]`.
- [ ] Type-check: `pnpm exec tsc --noEmit` → PASS.

### Task 0.4: `generate-run-manifest.ts`
**Files:** Create `scripts/metrics/generate-run-manifest.ts`
- [ ] Resolve context via `resolveExperimentContext()`, runId via `resolveRunId(tool)`. Read `startedAt`/`endedAt` from `RUN_STARTED_AT`/`RUN_ENDED_AT` env (else null). `workflowName` from `WORKFLOW_NAME ?? GITHUB_WORKFLOW`. `generatedAt` from `resolveGeneratedAt()` else current ISO via `new Date().toISOString()` (manifest generation is the ONE place a wall-clock timestamp is allowed). Write `metrics/raw/run-manifest/<runId>.json` (mkdir -p). Print the path. **Exit 1 only if runId is empty.**
- [ ] Run: `TOOL_NAME=api PLATFORM=api DRIVER=api pnpm run metrics:manifest` (after Phase 3 wires it; for now: `ts-node -r tsconfig-paths/register scripts/metrics/generate-run-manifest.ts`). Expected: a JSON file under `metrics/raw/run-manifest/` with `architectureType:"TOM"`.
- [ ] Validate output matches schema (ajv optional; minimally `JSON.parse`).

**Phase 0 gate:** `pnpm exec tsc --noEmit` PASS; one manifest written with `architectureType:"TOM"`.

---

## PHASE 1 — Operational processors (parallel; group into workers)

Each script: `import` lib, wrap in try/catch, enrich rows via `commonColumns(runId, idx)`, `writeCsv`. All emit headers-only when no input. **`generated_at`/timestamp**: use manifest `generatedAt`; if absent use `resolveGeneratedAt()` → `'UNKNOWN'`.

### Task 1.1: `extract-scenario-inventory.ts` → `processed/scenario_inventory.csv`
- Parse every `*.feature` under `src/core/tests/**` with `@cucumber/gherkin` + `@cucumber/messages` (already a dep via cucumber-js; if not importable, fall back to a regex line parser counting `Scenario`/`Scenario Outline`, `Examples` rows, `@tags`, steps).
- Columns: common columns (tool/platform/viewport=`ALL`, status=`UNKNOWN`) + `feature_file,feature_name,scenario_name,scenario_type,tags,example_rows,step_count`.
- [ ] Run `metrics:inventory`; expect ≥1 row per scenario across 8 features (see article_tables.md sample for shape).

### Task 1.2: `build-platform-coverage.ts` → `processed/platform_coverage_matrix.csv`
- From the same feature parse, map tags→platform booleans: `@desktop→desktop, @responsive→responsive, @android→android, @ios→ios, @api→api, @performance→performance, @visual→visual`. `total_platforms`=count of true (max 7).
- Columns: common (ALL) + `feature_file,feature_name,scenario_name,desktop,responsive,android,ios,api,performance,visual,total_platforms` (booleans as `YES`/``).
- [ ] Run `metrics:coverage`; expect matrix matching tag usage.

### Task 1.3: `normalize-telemetry.ts` → `raw/cucumber-jsonl/<id>.jsonl`, `raw/tool-events/<id>.jsonl`, `processed/scenario_outcome_history.csv`
- Read `reports/*.json` (cucumber JSON). For each element(scenario) emit a normalized JSONL record `{runId,feature,scenario,status,durationMs,steps:[{name,status,durationMs,errorMessage}]}` to `raw/cucumber-jsonl/<runId>.jsonl` (runId from env/manifest; group by source report→runId mapping or single env runId).
- Read `results/run-*/telemetry.jsonl`; re-emit each step event (normalize `SKIPPED→SKIP`, keep PASS/FAIL) to `raw/tool-events/<runId>.jsonl`.
- `scenario_outcome_history.csv` columns: common + `feature,scenario,outcome` where outcome is scenario-level (FAIL if any step failed, else PASS, else SKIP). One row per (run_id, scenario) — across multiple run manifests/run_index this accumulates history.
- Status mapping: cucumber `passed→PASS, failed→FAIL, skipped|pending|undefined→SKIP`.
- [ ] Run `metrics:normalize`; expect outcome rows + jsonl files (headers-only/empty if no reports).

### Task 1.4: `aggregate-durations.ts` → `processed/scenario_durations.csv`, `processed/platform_durations.csv`
- Source: `raw/tool-events/*.jsonl` (preferred) else `results/run-*/telemetry.jsonl`. Sum step durations per scenario.
- `scenario_durations.csv`: common + `feature,scenario,duration_ms,step_count,status`.
- `platform_durations.csv`: grouped by (platform,viewport): common(tool/scenario-agnostic, scenario fields omitted) + `runs,scenarios,avg_ms,p50_ms,p95_ms,p99_ms,failures`. Percentiles via nearest-rank on sorted scenario durations.
- [ ] Run `metrics:durations`; expect per-platform aggregates.

### Task 1.5: `normalize-api-contract-telemetry.ts` → `processed/api_isolated_results.csv`
- Read `metrics/raw/api/*.jsonl` (`ApiContractTelemetryEvent`). One row per event.
- Columns: common(tool=`api`,platform=`api`) + `feature,endpoint_id,method,path,response_status,response_time_ms,duration_ms,assertion_count,failed_assertions,extracted_keys_count`. status from event.
- [ ] Run `metrics:api`; headers-only if none.

### Task 1.6: `normalize-visual-contract-telemetry.ts` → `processed/visual_comparison_results.csv`
- Read `metrics/raw/visual/*.jsonl` (`VisualContractTelemetryEvent`). One row per event.
- Columns: common(tool=`pixelmatch`,platform from event/manifest) + `feature,snapshot_id,baseline_path,actual_path,diff_path,diff_pixels,diff_ratio,threshold,passed`. status from event.
- [ ] Run `metrics:visual`; headers-only if none.

### Task 1.7: `normalize-gatling-summary.ts` → `processed/performance_summary.csv`
- Read `metrics/raw/gatling/*/summary.json` (`PerformanceSummary`). One row per file.
- Columns: common(tool=`gatling`,platform=`performance`) + `simulation_name,request_count,success_count,failure_count,mean_response_time_ms,p95_response_time_ms,duration_ms`. status from summary.
- [ ] Add package script `metrics:gatling`. Run it; headers-only if none.

### Task 1.8: `compute-failure-buckets.ts` → `processed/failure_buckets.csv`
- Source: `raw/tool-events/*.jsonl` + `raw/cucumber-jsonl/*.jsonl` + `metrics/raw/api/*.jsonl` (status FAIL) + `metrics/raw/visual/*.jsonl` (passed=false → VISUAL_DIFF_FAILURE / baseline missing). For each failing unit call `classifyFailure`.
- Columns (exact, per spec §14): `architecture_type,repository_name,experiment_batch_id,run_index,workflow_run_id,workflow_attempt,tool_name,platform,viewport,run_id,feature,scenario,step,status,failure_bucket,error_message,source_file,generated_at`. Non-failures may be omitted; `failure_bucket=` (empty) only if a row is emitted for a pass — default omit passes.
- error_message truncated to 500 chars, newlines→spaces, no secrets (already hashed upstream).
- [ ] Add `metrics:failures`. Run it.

### Task 1.9: `compute-proxy-overhead.ts` → `raw/proxy-jsonl/<id>.jsonl`, `processed/proxy_overhead_summary.csv`
- Source: `logs/**/proxy*.log` (+ `PROXY_LOG` env override). Use tolerant JSONL read; keep records with numeric `proxyOverheadMs`. Re-emit kept records to `raw/proxy-jsonl/<runId>.jsonl`.
- `proxy_overhead_summary.csv` grouped by (tool/platform from manifest, actionId): common + `action_id,count,avg_proxy_overhead_ms,p50_proxy_overhead_ms,p95_proxy_overhead_ms,avg_grpc_latency_ms`. If no logs → headers only.
- [ ] Add `metrics:proxy`. Run it.

### Task 1.10: `build-article-tables.ts` → `summary/article_tables.md`, `summary/experiment_summary.json`
- Read all processed CSVs via `readCsv`. Render markdown tables: Tool coverage, Feature-to-tool coverage, Scenario inventory summary, Scenario duration by tool/platform, API result summary, Visual result summary, Performance result summary, Failure bucket distribution, Proxy overhead summary, + a "Quality attribute summary" pointer linking `article_quality_attributes.md`. Top line: `architecture_type = TOM`, batch/run_index from any manifest.
- `experiment_summary.json`: `{architecture_type:'TOM', experiment_batch_id, run_index, generated_at, totals:{scenarios,executions,pass,fail}, artifacts:{<csv>:{present,rows}}}`.
- [ ] Run `metrics:tables`; open the md.

**Phase 1 gate:** `pnpm exec tsc --noEmit` PASS; `pnpm metrics:all` runs end-to-end on current (mostly empty) inputs producing all 10 processed CSVs (headers at minimum) + article_tables.md without throwing.

---

## PHASE 2 — Quality processors (parallel; group into workers)

All use `writeQualityCsv` + `safeMain` from `lib/quality.ts`. Repo-level metrics use tool/platform=`ALL`. Unavailable → record with `metric_value:'NOT_AVAILABLE'` and `source_file` note. Build `lib/quality.ts` FIRST (it's the Phase-2 shared contract — assign to the foundation worker or the first Phase-2 worker before others start).

### Task 2.0: `lib/quality.ts`
- [ ] Implement per SHARED CONTRACTS. `safeMain` catches, `console.warn`, exits 0.

### Task 2.1: `measure-maintainability.ts` → `maintainability_metrics.csv` (category `Maintainability`)
- Walk `src/**/*.ts`: `average_file_size_loc`, `max_file_size_loc` (count). `duplicated_loc`/`duplicated_code_percentage` via normalized-line hash (lines len≥40 chars, count duplicate occurrences / total). `files_touched_per_change` = avg changed files per commit from `git log --pretty=format:%H --name-only -n 100` if git available else `NOT_AVAILABLE`. `cyclomatic_complexity_if_available` = `NOT_AVAILABLE`. `failure_bucket_coverage_percentage` = classified/total failures from `failure_buckets.csv`. `telemetry_completeness_percentage` from `tool-events` records having required fields.
- [ ] Run `metrics:quality:maintainability`.

### Task 2.2: `measure-modifiability.ts` → `modifiability_metrics.csv` (category `Modifiability`)
- Need base ref: `METRICS_BASE_REF` env (else `NOT_AVAILABLE` for all change counts). `git diff --numstat <base>...HEAD`. Classify file paths: core=`src/kernel/**`,`src/proto/**`,`src/plugins/*/server.ts`,`src/kernel/start-plugins.ts`; execution=`src/plugins/**` (non-server); adapter=`src/plugins/*/actions/**`,`*register*Actions*`; reporting=`scripts/metrics/**`,`apps/dashboard/**`,`scripts/report/**`; configuration=`*.json`,`*.yml`,`.env*`,`tsconfig*`. Emit `core_files_modified, execution_layer_files_modified, adapter_files_modified, reporting_files_modified, configuration_files_modified, loc_added, loc_deleted, loc_modified(=min add,del per file summed), change_impact_score`.
- [ ] Run `metrics:quality:modifiability` (expect NOT_AVAILABLE locally without base ref).

### Task 2.3: `measure-extensibility.ts` → `extensibility_metrics.csv` (category `Extensibility`)
- Read optional `metrics/raw/tool-integration/*.json` (fields per spec §15.11). If present, emit per-tool `new_tool_files_added, new_tool_files_modified, new_tool_loc_added, existing_core_files_changed_for_new_tool, integration_effort_proxy_score`. Else compute from `METRICS_BASE_REF` git diff, else `NOT_AVAILABLE`. `new_action_or_adapter_count`/`registration_changes_count` from diff path heuristics.
- [ ] Run `metrics:quality:extensibility`.

### Task 2.4: `measure-reusability.ts` → `reusability_metrics.csv` (category `Reusability`)
- From `scenario_inventory.csv` + `platform_coverage_matrix.csv`: `scenario_reuse_ratio` = scenarios with `total_platforms>1` / total. `feature_to_tool_coverage` = executed (feature,tool) pairs (from outcome history) / expected (feature × tagged tools). Count contract files: `**/contracts/**/*.json` for `locator_contract_reuse_count`(*.locators.json), `api_contract_reuse_count`, `visual_contract_reuse_count`. `shared_step_reuse_count` = step definitions referenced by >1 feature (heuristic: count step_definitions files / total features).
- [ ] Run `metrics:quality:reusability`.

### Task 2.5: `measure-reliability.ts` → `reliability_metrics.csv` (category `Reliability`)
- From `scenario_outcome_history.csv` (+ `failure_buckets.csv`). `pass_rate`,`fail_rate`. Group by (scenario,tool,platform) ordered by `run_index`: `flaky_scenario_count` (both PASS and FAIL observed), `pass_to_fail_probability`, `fail_to_pass_probability` (transition counts / total transitions; `null` if <2 observations). `retry_count`=`NOT_AVAILABLE` unless present. `infrastructure_failure_rate`,`tool_failure_rate` from failure buckets.
- [ ] Run `metrics:quality:reliability` (single run → flaky=0, transitions null).

### Task 2.6: `measure-performance-efficiency.ts` → `performance_efficiency_metrics.csv` (category `Performance Efficiency`)
- From `scenario_durations.csv`,`platform_durations.csv`,`performance_summary.csv`,manifests,`proxy_overhead_summary.csv`. `p50/p95/p99_scenario_duration_ms`,`scenario_duration_ms`(mean),`workflow_duration_ms`/`job_duration_ms` from manifest started/ended (else NOT_AVAILABLE). `proxy_overhead_ms`,`grpc_or_ipc_latency_ms` from proxy summary — **emit as separate TOM-only rows** (metric_unit `ms`, note in source_file `TOM-only overhead`). `tool_startup_duration_ms`,`telemetry_processing_duration_ms`=NOT_AVAILABLE unless measured.
- [ ] Run `metrics:quality:performance`.

### Task 2.7: `measure-observability.ts` → `observability_metrics.csv` (category `Observability`)
- `telemetry_event_count`,`telemetry_completeness_percentage`,`missing_run_manifest_count`(run_ids in CSVs with no manifest),`missing_scenario_duration_count`,`missing_failure_bucket_count`(FAIL rows w/o bucket),`classified_failure_percentage`,`unclassified_failure_percentage`,`logs_uploaded`/`artifacts_uploaded`/`raw_metrics_uploaded`/`processed_metrics_uploaded` = booleans from dir presence (`logs/`,`metrics/raw/**`,`metrics/processed/**`).
- [ ] Run `metrics:quality:observability`.

### Task 2.8: `measure-portability.ts` → `portability_metrics.csv` (category `Portability`)
- From `platform_coverage_matrix.csv`,`platform_durations.csv`,manifests. `supported_tool_count`=8 (known tool set), `successful_tool_count`/`failed_tool_count` from outcome history per tool, `platform_coverage_percentage`= successful (platform,tool) pairs / expected, `environment_specific_config_count`=count of `caps/*`/profile files, `platform_specific_locator_count`=`*.locators.json` keyed by platform (heuristic), `successful_platform_matrix_percentage`.
- [ ] Run `metrics:quality:portability`.

### Task 2.9: `measure-interoperability.ts` → `interoperability_metrics.csv` (category `Interoperability`)
- `tool_count`=distinct tools executed; `oracle_count`; booleans `api_oracle_available`(api results>0),`ui_oracle_available`(web/mobile events),`visual_oracle_available`(visual results>0),`performance_oracle_available`(perf summary>0). `oracle_composition_count`/`successful_oracle_composition_count` from scenarios tagged with multiple oracle dimensions (e.g. @api+@visual). Oracle types: API,UI_WEB,UI_MOBILE,VISUAL_WEB,VISUAL_MOBILE,PERFORMANCE.
- [ ] Run `metrics:quality:interoperability`.

### Task 2.10: `build-quality-attribute-summary.ts`
- Merge all 9 per-attribute CSVs → `processed/quality_attribute_metrics.csv` (same 15 columns). Emit `summary/quality_attribute_summary.md` (one table per attribute, format `| Quality Attribute | Metric | Value | Unit | Tool | Source |`), `summary/quality_attribute_summary.json` (nested by attribute), `summary/article_quality_attributes.md` (the article table `| Quality Attribute | Operational Definition | Example Metrics | Interpretation |` with the 9 rows from spec §15.14 verbatim text).
- [ ] Run `metrics:quality:summary`; open the 3 outputs.

**Phase 2 gate:** `pnpm exec tsc --noEmit` PASS; `pnpm metrics:quality:all` runs producing all 10 quality CSVs + 3 summary files without throwing; unavailable metrics show `NOT_AVAILABLE`.

---

## PHASE 3 — Workflow + package scripts

### Task 3.1: `package.json` scripts (one worker; shared file)
Add (keep existing): `metrics:gatling`, `metrics:failures`, `metrics:proxy`; update `metrics:all` to append `&& pnpm run metrics:gatling && pnpm run metrics:failures && pnpm run metrics:proxy`. Add all 11 `metrics:quality:*` (mapping per spec §15.12 but with `ts-node -r tsconfig-paths/register` not `tsx`). Add `metrics:experiment: pnpm run metrics:all && pnpm run metrics:quality:all`. Also add `metrics:manifest` already exists — verify points to generate-run-manifest.
- [ ] `pnpm run metrics:experiment` runs both chains green.

### Task 3.2: `.github/workflows/tom-quantitative-execution.yml`
Mirror `ahm-execution-helix.yml` service-startup/container patterns. Name `TOM — Quantitative Execution`. Triggers `workflow_dispatch`(inputs per spec §5) + `push`/`pull_request` to main. Global env per spec §5. 8 jobs (api, playwright-desktop, playwright-responsive, pixelmatch-desktop, pixelmatch-responsive, appium-android, appium-ios, gatling) with per-job env + `TOM_RUN_ID` per spec §7. Each job: set `RUN_STARTED_AT` before tests, `RUN_ENDED_AT` after; run `pnpm run metrics:manifest` (with job env) then tests then (always) `metrics:all`; pixelmatch jobs `VISUAL_UPDATE_BASELINE=false`, may `needs` their playwright sibling. All metric/parse/upload steps `if: always()`. Per-tool artifact `tom-metrics-<tool>-${{ github.run_id }}` of `metrics/ results/ logs/ visual-results/ target/gatling/`. Logs to `logs/<tool>/`. Final `consolidate` job (`needs: [all]`, `if: always()`): download artifacts, run `metrics:experiment`, upload `tom-metrics-consolidated-${{ github.run_id }}`.
- [ ] Validate YAML: `pnpm exec js-yaml .github/workflows/tom-quantitative-execution.yml` (or `python -c "import yaml,sys;yaml.safe_load(open(...))"`); run `actionlint` if available.

### Task 3.3: `.github/workflows/update-visual-baselines.yml`
- [ ] Add job env: `ARCHITECTURE_TYPE: TOM`, `TOOL_NAME: pixelmatch`, `PLATFORM: web`, `DRIVER: playwright`, `TOM_RUN_ID: tom-refresh-${{ github.run_id }}-${{ github.run_attempt }}`. Do not change baseline-refresh logic. Validate YAML parses.

**Phase 3 gate:** both YAML files parse; `metrics:experiment` green.

---

## PHASE 4 — Docs (parallel)

### Task 4.1–4.4: the four docs
- [ ] `docs/research/tom-quantitative-protocol.md` — spec §17 items.
- [ ] `docs/research/metrics-protocol.md` — spec §17 items.
- [ ] `docs/research/quality-attribute-measurement-model.md` — spec §17 items + 9 attributes + TOM-only overhead rationale.
- [ ] `docs/architecture/tom-experimental-architecture.md` — kernel/proxy, plugins, contracts, telemetry, visual & performance oracles, composable oracle compositions.
- All English. No AHM/Helix terminology. Link to `metrics/summary/article_quality_attributes.md`.

**Phase 4 gate:** files exist, links resolve, attribute tables present.

---

## Final validation (after all phases)
```
pnpm exec tsc --noEmit
pnpm run metrics:experiment          # operational + quality, all green, headers-only ok on empty inputs
node -e "require('js-yaml')..."      # both workflows parse
git status --short                   # review staged set; user commits
```
Environment-specific (only if available): `pnpm test --tags '@api'`, `pnpm perf:smoke`, Playwright/Appium suites.

## Parallel dispatch strategy (for the orchestrator)
1. **Wave 0 (serial, 1 agent or inline):** Phase 0 tasks 0.1–0.4 + Task 2.0 (`lib/quality.ts`). Everything depends on `lib/`. Gate on `tsc --noEmit`.
2. **Wave 1 (parallel, ~3 agents):** Phase 1 split — agentA: 1.1,1.2,1.3; agentB: 1.4,1.5,1.6,1.7; agentC: 1.8,1.9,1.10. Each given the SHARED CONTRACTS verbatim. No shared files (each script distinct). Gate: `metrics:all`.
3. **Wave 2 (parallel, ~3 agents):** Phase 2 split — agentD: 2.1,2.2,2.3; agentE: 2.4,2.5,2.6; agentF: 2.7,2.8,2.9. Then inline 2.10. Gate: `metrics:quality:all`.
4. **Wave 3:** Phase 3 inline (package.json + workflows — shared/critical, do not parallelize package.json). Phase 4 docs in parallel (4 agents, independent files).
5. Final validation + stage. **User commits.**

## Self-review notes
- Spec coverage: all 10 operational CSVs (1.1–1.10), all 10 quality CSVs + 3 summaries (2.1–2.10), manifest (0.4), schemas (0.1–0.2), failure buckets enum+columns (1.8 + lib), proxy overhead w/o kernel change (1.9), workflow+artifacts+if:always (3.2), visual baseline env (3.3), package scripts (3.1), 4 docs (4.x) — covered.
- No `tsx`: all package scripts use `ts-node -r tsconfig-paths/register` (repo convention).
- Type consistency: `commonColumns`, `writeCsv`, `classifyFailure`, `writeQualityCsv`, `resolveRunId` names are fixed in SHARED CONTRACTS and referenced identically by all tasks.
- Determinism: row bodies never call `Date.now()`; only `generate-run-manifest` stamps wall-clock.
