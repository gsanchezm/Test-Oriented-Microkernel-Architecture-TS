# TOM Quantitative Metrics & Experimental Readiness — Design

**Date:** 2026-05-28
**Status:** Approved (design); implementation pending
**Scope:** TOM repository only. No gTAA baseline folders are created in this task.

## 1. Purpose

Make the existing Test-Oriented Microkernel (TOM) architecture **quantitatively measurable** so it can
produce experimental evidence for the article *"Quantifying Test-Oriented Microkernel Architecture for
Cross-Platform Test Automation."* The same metrics schema must later be reusable, unchanged, by a future
gTAA baseline repository. In this task every metric record emits `architecture_type = TOM`.

### Framing constraints (binding)
- TOM is an **independent** cross-platform test execution architecture. Do **not** frame it as dependent on
  the Atomic Helix Model. Avoid AHM / Helix / atom / molecule / organism / resonance terminology in **new**
  workflow names, artifact names, metrics files, summaries, and paper-facing documentation.
- Do **not** create or modify gTAA baseline folders.
- Do **not** remove or alter the TOM kernel, proxy routing, plugin servers, action registries, contracts,
  locator resolver, telemetry pipeline, or existing working tests.
- Do **not** add citations to prior work.
- Missing data is represented as `null`, `UNKNOWN`, or `NOT_AVAILABLE`. Never fabricate.

## 2. Current-state findings (baseline this design builds on)

- **Telemetry already emits into `metrics/raw/`:**
  - `src/core/contracts/contract-telemetry-writer.ts` writes `metrics/raw/api/<runId>.jsonl` and
    `metrics/raw/visual/<runId>.jsonl` (schema v1.0.0) and already resolves run id via
    `TOM_RUN_ID → GITHUB_RUN_ID → generated`.
  - `src/plugins/gatling/actions/performance-telemetry-writer.ts` writes
    `metrics/raw/gatling/<runId>/summary.json`.
  - `src/telemetry/logger.ts` writes per-step events to `results/run-*/telemetry.jsonl`, enriched with
    `architecture: 'AHM'`, `driver`, `methodology`.
  - `src/kernel/chaos-proxy.ts` emits per-intent `proxyOverheadMs` / `piCalculusLatencyMs` JSONL to **stdout**.
- **Scaffold exists, scripts do not:** `metrics/` tree, 6 JSON schemas, and `metrics/summary/article_tables.md`
  are committed. `package.json` references `scripts/metrics/*.ts` (manifest, inventory, coverage, normalize,
  durations, api, visual, tables) but **none of those files exist**.
- **Runner:** `ts-node -r tsconfig-paths/register` (CLAUDE.md forbids a `tsc` build step). The spec's `tsx`
  suggestion is overridden to match repo convention.
- **`.gitignore`:** `metrics/raw/**`, `metrics/processed/**`, `metrics/figures/**`, `reports/`,
  `visual-results/`, `visual-baselines/*` are local-only; `metrics/schemas/` and `metrics/summary/` are tracked.
- **Existing schema gap:** `run-manifest.schema.json` lacks `architecture_type`, `experiment_batch_id`,
  `run_index`, `workflow_run_id`, `workflow_attempt`, `job_name`, `tool_name`, `started/endedAt`.
- **Tests:** 8 features / ~22 outlines. Platform/tool tags: `@desktop @responsive @android @ios @api @visual
  @ui-only @performance`. World = `CheckoutWorld` (carries `orderContext.market`, `locale.language`).
  Routes (`*.route.ts`) branch on `process.env.DRIVER`.
- **Workflows:** `ahm-execution-helix.yml` (full execution, push/PR/dispatch), `update-visual-baselines.yml`,
  `deploy-pages.yml`.

## 3. Approved decisions

1. **Sequencing:** Write this spec + a phased implementation plan, then build in phases using parallel agents.
2. **architecture_type:** Normalize **at the metrics layer only**. Source emitters are untouched. Processors
   stamp `architecture_type` from `ARCHITECTURE_TYPE` (default `TOM`).
3. **New workflow trigger:** `workflow_dispatch` **and** `push`/`pull_request` to `main`. The existing
   `ahm-execution-helix.yml` is left as-is.
4. **Never-commit:** the assistant stages and proposes; the user runs `git commit`.
5. **Docs are tracked:** `docs/` was gitignored repo-wide. `.gitignore` is changed to `docs/*` +
   `!docs/research/` + `!docs/architecture/` + `!docs/superpowers/` so paper-facing documentation and this
   spec become committed, reproducible evidence; `docs/handsoff` and other docs stay local.

## 4. Architecture of the metrics layer

### 4.1 Manifest = single source of experimental identity
Each job writes exactly one `metrics/raw/run-manifest/<run-id>.json`. It is the authoritative carrier of:
`architectureType, experimentBatchId, runIndex, repositoryName, workflowName, workflowRunId, workflowAttempt,
jobName, toolName, platform, viewport, driver, commitSha, branch, os, nodeVersion, environment,
generatedAt, startedAt?, endedAt?`.

**Every processor loads the available manifest(s) and stamps the common experimental columns onto every output
row**, joined by `run_id`. When a row's `run_id` has no manifest (pure local run), the processor falls back to
env vars, then to `UNKNOWN`/`null`. This is the mechanism by which `architecture_type = TOM` reaches all metrics
without modifying any emitter.

**Run id rule:** `TOM_RUN_ID` if set, else
`tom-<github_run_id>-<github_run_attempt>-<tool_name>-<timestamp>`. Fail only if a run id cannot be produced.

### 4.2 No kernel / no feature-behavior changes
- **Proxy overhead:** proxy stdout is redirected to `logs/<tool>/proxy.log` in the workflow (helix already does
  `proxy.log`). `compute-proxy-overhead.ts` reads the log, keeps lines that `JSON.parse` into a record with a
  numeric `proxyOverheadMs`, writes `metrics/raw/proxy-jsonl/<run-id>.jsonl` and
  `metrics/processed/proxy_overhead_summary.csv`. `chaos-proxy.ts` is **not edited**.
- **Cucumber JSONL:** derived from the existing `reports/*.json` by `normalize-telemetry.ts`. No formatter or
  hook change required; the workflow already produces `reports/*.json`.
- **Tool events:** `normalize-telemetry.ts` also reads `results/run-*/telemetry.jsonl` to emit
  `metrics/raw/tool-events/<run-id>.jsonl` (normalized scenario/step events) and several processed CSVs.

### 4.3 Shared library (`scripts/metrics/lib/`)
Small, single-purpose modules (relative imports within `scripts/`):
- `paths.ts` — repo-root resolution + canonical metrics paths.
- `env.ts` — `resolveRunId()`, `resolveExperimentContext()` (reads `ARCHITECTURE_TYPE`/`EXPERIMENT_BATCH_ID`/
  `RUN_INDEX`/`TOOL_NAME`/`PLATFORM`/`VIEWPORT`/`DRIVER`/GitHub vars; defaults `architecture_type=TOM`).
- `manifest.ts` — load all run-manifests, index by run id, provide `enrich(row, runId)`.
- `csv.ts` — deterministic CSV writer (stable column order, empty-with-headers when no rows, sorted rows).
- `failure-buckets.ts` — `classifyFailure(errorMessage, context) → bucket` using the standardized enum.
- `jsonl.ts` — tolerant JSONL reader (skips non-JSON lines, used for proxy log scraping).
- `discover.ts` — glob raw inputs across run ids.

### 4.4 Data-integrity rules (apply to every script)
- Deterministic output (sorted rows, fixed columns, no timestamps inside row bodies except explicit
  `generated_at`). `generated_at` is sourced from the manifest `generatedAt` or `GENERATED_AT` env to keep
  reruns reproducible; falls back to `UNKNOWN` rather than `Date.now()` when determinism is required.
- One script failing must not abort the rest. Each script wraps its body in try/catch, logs a warning, writes
  a headers-only CSV, and exits 0 (the orchestrating `&&` chain decides hard failure only for genuinely fatal
  cases such as a missing run id in manifest generation).
- No secrets in output. Sensitive payloads are hashed (already done by the contract writer).
- `tool_name = ALL` and `platform = ALL` for repository-level metrics.

## 5. Schemas (`metrics/schemas/`)

- **Extend** `run-manifest.schema.json` additively: add `schemaVersion, architectureType, experimentBatchId,
  runIndex, repositoryName, workflowName, workflowRunId, workflowAttempt, jobName, toolName, startedAt,
  endedAt`. Existing fields retained for back-compat.
- **Add** `experiment-record.schema.json`: the common column set shared by processed CSVs
  (`architecture_type, repository_name, experiment_batch_id, run_index, workflow_run_id, workflow_attempt,
  job_name, tool_name, platform, viewport, run_id, commit_sha, branch, timestamp, status`).
- **Add** `quality-attribute-metric.schema.json`: the 15-column quality record
  (`architecture_type, repository_name, experiment_batch_id, run_index, workflow_run_id, workflow_attempt,
  tool_name, platform, viewport, metric_category, metric_name, metric_value, metric_unit, source_file,
  generated_at`).

## 6. Raw outputs

| Raw file | Source | Producer |
|---|---|---|
| `metrics/raw/run-manifest/<id>.json` | env vars | `generate-run-manifest.ts` |
| `metrics/raw/cucumber-jsonl/<id>.jsonl` | `reports/*.json` | `normalize-telemetry.ts` |
| `metrics/raw/tool-events/<id>.jsonl` | `results/run-*/telemetry.jsonl` | `normalize-telemetry.ts` |
| `metrics/raw/api/<id>.jsonl` | API plugin (existing) | unchanged emitter |
| `metrics/raw/visual/<id>.jsonl` | Pixelmatch plugin (existing) | unchanged emitter |
| `metrics/raw/gatling/<id>/summary.json` | Gatling plugin (existing) | unchanged emitter |
| `metrics/raw/proxy-jsonl/<id>.jsonl` | `logs/<tool>/proxy.log` | `compute-proxy-overhead.ts` |
| `metrics/raw/tool-integration/*.json` (optional) | hand-maintained | input for extensibility |

## 7. Operational processed outputs & scripts (`scripts/metrics/`)

| Script | Output(s) |
|---|---|
| `generate-run-manifest.ts` | `metrics/raw/run-manifest/<id>.json` |
| `extract-scenario-inventory.ts` | `processed/scenario_inventory.csv` |
| `build-platform-coverage.ts` | `processed/platform_coverage_matrix.csv` |
| `normalize-telemetry.ts` | `raw/cucumber-jsonl/*`, `raw/tool-events/*`, `processed/scenario_outcome_history.csv` |
| `aggregate-durations.ts` | `processed/scenario_durations.csv`, `processed/platform_durations.csv` |
| `normalize-api-contract-telemetry.ts` | `processed/api_isolated_results.csv` |
| `normalize-visual-contract-telemetry.ts` | `processed/visual_comparison_results.csv` |
| `normalize-gatling-summary.ts` | `processed/performance_summary.csv` |
| `compute-failure-buckets.ts` | `processed/failure_buckets.csv` |
| `compute-proxy-overhead.ts` | `raw/proxy-jsonl/*`, `processed/proxy_overhead_summary.csv` |
| `build-article-tables.ts` | `summary/article_tables.md`, `summary/experiment_summary.json` |

**Failure buckets enum:** `API_CONTRACT_FAILURE, API_RESPONSE_FAILURE, UI_ACTION_FAILURE,
LOCATOR_RESOLUTION_FAILURE, VISUAL_DIFF_FAILURE, VISUAL_BASELINE_MISSING, PERFORMANCE_THRESHOLD_FAILURE,
MOBILE_SESSION_FAILURE, WEB_SESSION_FAILURE, INFRASTRUCTURE_FAILURE, DATA_SETUP_FAILURE, ASSERTION_FAILURE,
TIMEOUT_FAILURE, UNKNOWN_FAILURE`. No failure → `failure_bucket = null`. `failure_buckets.csv` columns:
`architecture_type, repository_name, experiment_batch_id, run_index, workflow_run_id, workflow_attempt,
tool_name, platform, viewport, run_id, feature, scenario, step, status, failure_bucket, error_message,
source_file, generated_at`.

## 8. Quality-attribute outputs & scripts (`scripts/metrics/`)

All read **objective** evidence (repo files, git history, telemetry, processed CSVs, CI artifacts). No surveys.
Each writes its per-attribute CSV with the 15-column quality schema. Unavailable metrics emit a row with
`metric_value = NOT_AVAILABLE` and a `source_file` note rather than failing.

| Script | Output | Objective evidence |
|---|---|---|
| `measure-maintainability.ts` | `processed/maintainability_metrics.csv` | fs file sizes; line-hash duplicated-LOC heuristic; telemetry completeness; failure-bucket coverage; `files_touched_per_change` from git log if available else `NOT_AVAILABLE`; `cyclomatic_complexity` `NOT_AVAILABLE` unless a lightweight AST pass is added |
| `measure-modifiability.ts` | `processed/modifiability_metrics.csv` | `git diff <base>...HEAD` classified into core / execution / adapter / reporting / config; `loc_added/deleted/modified`; `change_impact_score`; `NOT_AVAILABLE` without a base ref |
| `measure-extensibility.ts` | `processed/extensibility_metrics.csv` | optional `metrics/raw/tool-integration/*.json` + git diff; new vs core files; `integration_effort_proxy_score` |
| `measure-reusability.ts` | `processed/reusability_metrics.csv` | `scenario_inventory.csv` + `platform_coverage_matrix.csv` + contract/step counts; `scenario_reuse_ratio`, `feature_to_tool_coverage` |
| `measure-reliability.ts` | `processed/reliability_metrics.csv` | `scenario_outcome_history.csv` (+ `failure_buckets.csv`); pass/fail rate, flaky count, pass→fail / fail→pass across `run_index` |
| `measure-performance-efficiency.ts` | `processed/performance_efficiency_metrics.csv` | durations CSVs + manifests + `proxy_overhead_summary.csv`; p50/p95/p99; proxy overhead reported **separately** (TOM-only trade-off) |
| `measure-observability.ts` | `processed/observability_metrics.csv` | raw+processed presence, telemetry completeness, classified-failure %, artifacts uploaded |
| `measure-portability.ts` | `processed/portability_metrics.csv` | `platform_coverage_matrix.csv` + manifests; successful tool/platform matrix % |
| `measure-interoperability.ts` | `processed/interoperability_metrics.csv` | tool/oracle coverage; oracle composition counts (API, UI_WEB, UI_MOBILE, VISUAL_WEB, VISUAL_MOBILE, PERFORMANCE) |
| `build-quality-attribute-summary.ts` | `processed/quality_attribute_metrics.csv`, `summary/quality_attribute_summary.{md,json}`, `summary/article_quality_attributes.md` | merges all per-attribute CSVs |

Quality attributes used (no Security): Maintainability, Modifiability, Extensibility, Reusability, Reliability,
Performance Efficiency, Observability, Portability, Interoperability.

## 9. Workflow `.github/workflows/tom-quantitative-execution.yml` (new)

- **Name:** `TOM — Quantitative Execution`. **Triggers:** `workflow_dispatch` + `push`/`pull_request` to `main`.
- **Dispatch inputs:** `platform` (all/api/playwright/playwright-desktop/playwright-responsive/appium/
  appium-android/appium-ios/gatling/pixelmatch/pixelmatch-desktop/pixelmatch-responsive, default `all`),
  `experiment_batch_id` (required, default `batch-001`), `run_index` (required, default `001`),
  `perf_profile` (smoke/load/stress), `perf_users`, `perf_duration`, `android_api_level`.
- **Global env:** `ARCHITECTURE_TYPE: TOM`, `EXPERIMENT_BATCH_ID`, `RUN_INDEX`, `REPOSITORY_NAME`,
  `WORKFLOW_RUN_ID`, `WORKFLOW_ATTEMPT`, `COMMIT_SHA`, `BRANCH_NAME`, plus existing `NODE_VERSION`, `LOG_LEVEL`,
  `PLAYWRIGHT_VERSION`, `PLAYWRIGHT_IMAGE`, `OMNIPIZZA_RELEASES_REPO`.
- **Jobs (tool-normalized display names):** `api` (API), `playwright-desktop` (Playwright — Desktop),
  `playwright-responsive` (Playwright — Responsive), `pixelmatch-desktop` (Pixelmatch — Desktop),
  `pixelmatch-responsive` (Pixelmatch — Responsive), `appium-android` (Appium — Android), `appium-ios`
  (Appium — iOS), `gatling` (Gatling). MobileWright excluded. Pixelmatch may depend on its Playwright sibling.
- **Per-job env:** `ARCHITECTURE_TYPE=TOM`, `EXPERIMENT_BATCH_ID`, `RUN_INDEX`, `TOOL_NAME`, `PLATFORM`,
  `VIEWPORT` (web), `DRIVER`, and a deterministic
  `TOM_RUN_ID=tom-${run_id}-${run_attempt}-${run_index}-<tool>` per the spec table. Pixelmatch jobs add
  `VISUAL_UPDATE_BASELINE=false`.
- **Service startup** mirrors helix (proxy + plugins, port waits, pinned Playwright container, emulator/
  simulator). Logs go to `logs/<tool>/*.log`. Startup failure → capture logs + `INFRASTRUCTURE_FAILURE` bucket.
- **`if: always()`** on every parse / normalize / manifest / upload step. Per-tool artifact
  `tom-metrics-<tool>-${run_id}` bundles `metrics/ results/ logs/ visual-results/ target/gatling/`. A final
  `consolidate` job (needs all, `if: always()`) downloads per-tool artifacts, runs `metrics:all` +
  `metrics:quality:all`, uploads `tom-metrics-consolidated-${run_id}`.
- **`update-visual-baselines.yml`:** add `ARCHITECTURE_TYPE=TOM`, `TOOL_NAME=pixelmatch`, `PLATFORM=web`,
  `DRIVER=playwright`, `TOM_RUN_ID=tom-refresh-${run_id}-${run_attempt}`. Baseline update stays separate from
  comparison; comparison jobs never update baselines.

## 10. Package scripts (`package.json`)

Add operational: `metrics:gatling`, `metrics:failures`, `metrics:proxy` (and keep existing
`metrics:manifest/inventory/coverage/normalize/durations/api/visual/tables`). Update `metrics:all` to include
gatling, failures, proxy while staying reasonably fast. Add quality:
`metrics:quality:{maintainability,modifiability,extensibility,reusability,reliability,performance,observability,
portability,interoperability,summary,all}`. Add umbrella `metrics:experiment` = `metrics:all && metrics:quality:all`.

## 11. Documentation

- `docs/research/tom-quantitative-protocol.md` — purpose, tools, jobs, raw/processed metrics, manifest fields,
  artifact strategy, how to run 100 executions, how gTAA reuses the schema, threats to validity.
- `docs/research/metrics-protocol.md` — raw/processed metrics, manifest fields, failure buckets, artifact
  strategy, architecture_type field, gTAA pairing, quality attributes, interpretation, missing-data handling.
- `docs/research/quality-attribute-measurement-model.md` — why architecture (not product) quality; the 9
  attributes, operational definitions, metrics, interpretation, no-fabrication rationale, TOM-only overhead.
- `docs/architecture/tom-experimental-architecture.md` — kernel/proxy, plugins, contracts, telemetry, visual &
  performance oracles, composable oracle compositions.

## 12. Phasing (implementation plan input)

1. **Schemas + shared `lib/` + `generate-run-manifest.ts`.** Gate: `tsc --noEmit`, manifest writes locally.
2. **Operational processors + `build-article-tables.ts`.** Gate: `tsc --noEmit`, `metrics:all` runs on empty
   inputs producing headers-only CSVs without crashing.
3. **Quality processors + `build-quality-attribute-summary.ts`.** Gate: `metrics:quality:all` runs.
4. **Workflow + package scripts + `update-visual-baselines.yml` env.** Gate: YAML lints / `actionlint` if
   available; package scripts resolve.
5. **Docs.** Gate: links resolve, attribute tables present.

## 13. Risks & assumptions

- Duplicated-LOC and cyclomatic complexity use lightweight heuristics; complexity may be `NOT_AVAILABLE` unless
  a minimal AST pass is added.
- git-diff–based modifiability/extensibility require a base ref (workflow input or env); default
  `NOT_AVAILABLE` for local runs without one.
- Reliability cross-run metrics (flaky, transitions) require aggregating ≥2 `run_index` artifacts together; a
  single run yields `flaky=0` and `null` transition probabilities.
- proxy-overhead depends on proxy stdout reaching `logs/<tool>/proxy.log`; if a job doesn't redirect it, the
  CSV is headers-only.
- The new workflow running on push/PR overlaps helix; acceptable per decision (helix ignored, not removed).

## 14. Acceptance criteria (from the brief)

Existing tests/architecture intact; no gTAA folders; `architecture_type = TOM` on all records; deterministic
`TOM_RUN_ID` + run manifest per job; `if: always()` metric uploads; TOM artifact naming free of AHM/Helix
terms; visual baseline update separate from comparison; standardized failure buckets; raw + processed +
article tables + quality metrics + quality summaries generated; docs present; `tsc --noEmit` passes; existing
package scripts still work; new metrics + quality scripts work; workflow supports 100 repeated runs.
