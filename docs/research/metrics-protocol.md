# Metrics Protocol

This document is the self-contained reference for the TOM metrics layer: the raw inputs, the
processed outputs, the run-manifest schema, the standardized failure buckets, the
`architecture_type` identity mechanism, pairing with the future gTAA baseline, and the rules for
interpreting metrics and handling missing data.

It complements `docs/research/tom-quantitative-protocol.md` (which covers tools, jobs, and how to run
a 100-execution experiment) and the quality-attribute companion described in §8.

---

## 1. Raw metrics

Raw inputs live under `metrics/raw/`. JSONL files hold one record per line.

| Raw path | Producer |
|---|---|
| `metrics/raw/run-manifest/<run-id>.json` | `scripts/metrics/generate-run-manifest.ts` |
| `metrics/raw/cucumber-jsonl/<run-id>.jsonl` | `scripts/metrics/normalize-telemetry.ts` (from `reports/*.json`) |
| `metrics/raw/tool-events/<run-id>.jsonl` | `scripts/metrics/normalize-telemetry.ts` (from `results/run-*/telemetry.jsonl`) |
| `metrics/raw/api/<run-id>.jsonl` | `src/core/contracts/contract-telemetry-writer.ts` (unchanged emitter) |
| `metrics/raw/visual/<run-id>.jsonl` | Pixelmatch visual telemetry (unchanged emitter) |
| `metrics/raw/gatling/<id>/summary.json` | Gatling action emitter (unchanged) |
| `metrics/raw/proxy-jsonl/<run-id>.jsonl` | `scripts/metrics/compute-proxy-overhead.ts` (scraped from `logs/<tool>/proxy.log`) |

The `api`, `visual`, and `gatling` raw files come from the existing framework emitters and are never
modified by the metrics layer. The router/proxy is never edited; its per-intent overhead is recovered
by scraping its stdout log into `metrics/raw/proxy-jsonl/`.

---

## 2. Processed metrics

`scripts/metrics/` writes 10 operational CSVs to `metrics/processed/`:

| CSV | Producer script |
|---|---|
| `scenario_inventory.csv` | `extract-scenario-inventory.ts` |
| `platform_coverage_matrix.csv` | `build-platform-coverage.ts` |
| `scenario_outcome_history.csv` | `normalize-telemetry.ts` |
| `scenario_durations.csv` | `aggregate-durations.ts` |
| `platform_durations.csv` | `aggregate-durations.ts` |
| `api_isolated_results.csv` | `normalize-api-contract-telemetry.ts` |
| `visual_comparison_results.csv` | `normalize-visual-contract-telemetry.ts` |
| `performance_summary.csv` | `normalize-gatling-summary.ts` |
| `failure_buckets.csv` | `compute-failure-buckets.ts` |
| `proxy_overhead_summary.csv` | `compute-proxy-overhead.ts` |

`build-article-tables.ts` renders `metrics/summary/article_tables.md` and
`metrics/summary/experiment_summary.json` from these CSVs. All processors are deterministic, emit
headers-only CSVs when there is no input, and never abort the rest of the pipeline.

---

## 3. Run manifest fields

The manifest (`metrics/schemas/run-manifest.schema.json`) is the authoritative carrier of
experimental identity. One manifest per job under `metrics/raw/run-manifest/<run-id>.json`.

`schemaVersion`, `runId`, `architectureType`, `experimentBatchId`, `runIndex`, `repositoryName`,
`workflowName`, `workflowRunId`, `workflowAttempt`, `jobName`, `toolName`, `platform`, `viewport`,
`driver`, `commitSha`, `branch`, `generatedAt`, `startedAt`, `endedAt`, `ciProvider`, `ciRunId`,
`tags`, `environment`, `nodeVersion`, `os`.

Required (non-null): `runId`, `generatedAt`, `schemaVersion`, `architectureType`,
`experimentBatchId`, `runIndex`, `repositoryName`, `platform`, `viewport`, `driver`, `environment`,
`nodeVersion`, `os`. The remaining fields are nullable. See `tom-quantitative-protocol.md` §6 for the
per-field meanings.

---

## 4. The common experimental columns (15)

Every processed operational CSV is prepended with these 15 columns, in this exact order
(`metrics/schemas/experiment-record.schema.json`):

```
architecture_type, repository_name, experiment_batch_id, run_index, workflow_run_id,
workflow_attempt, job_name, tool_name, platform, viewport, run_id, commit_sha, branch,
timestamp, status
```

Where they come from: the processor reads the run manifest indexed by `run_id` and copies these
fields onto every row. When a row's `run_id` has no manifest, the processor falls back to the
environment context resolved by `scripts/metrics/lib/env.ts` (`ARCHITECTURE_TYPE`,
`EXPERIMENT_BATCH_ID`, `RUN_INDEX`, `WORKFLOW_RUN_ID`, `WORKFLOW_ATTEMPT`, `JOB_NAME`, `TOOL_NAME`,
`PLATFORM`, `VIEWPORT`, `DRIVER`, `COMMIT_SHA`, `BRANCH_NAME`, and the GitHub equivalents), then to
`UNKNOWN`. `status` is one of `PASS | FAIL | SKIP | UNKNOWN`. Repository-level rows use
`tool_name = ALL` and `platform = ALL`.

---

## 5. Failure buckets

Failing units are classified into a fixed enum by `scripts/metrics/lib/failure-buckets.ts`. There are
**14 standardized buckets**:

1. `API_CONTRACT_FAILURE`
2. `API_RESPONSE_FAILURE`
3. `UI_ACTION_FAILURE`
4. `LOCATOR_RESOLUTION_FAILURE`
5. `VISUAL_DIFF_FAILURE`
6. `VISUAL_BASELINE_MISSING`
7. `PERFORMANCE_THRESHOLD_FAILURE`
8. `MOBILE_SESSION_FAILURE`
9. `WEB_SESSION_FAILURE`
10. `INFRASTRUCTURE_FAILURE`
11. `DATA_SETUP_FAILURE`
12. `ASSERTION_FAILURE`
13. `TIMEOUT_FAILURE`
14. `UNKNOWN_FAILURE`

Classification is objective and deterministic: `classifyFailure(status, errorMessage, ctx)` returns
`null` when `status !== 'FAIL'`. For a failure it matches ordered, case-insensitive keyword rules
against the error message (first match wins), then applies context fallbacks based on tool/platform
(for example an Appium/Android/iOS context with no stronger match resolves to `MOBILE_SESSION_FAILURE`,
an `api` tool to `API_RESPONSE_FAILURE`), and finally defaults to `UNKNOWN_FAILURE`.

### `failure_buckets.csv` columns

```
architecture_type, repository_name, experiment_batch_id, run_index, workflow_run_id,
workflow_attempt, tool_name, platform, viewport, run_id, feature, scenario, step, status,
failure_bucket, error_message, source_file, generated_at
```

`failure_bucket` is `null` (empty) when there is no failure — only failing units are bucketed.
Passing units are generally omitted from this CSV rather than emitted with an empty bucket.
`error_message` is truncated and newline-flattened; payloads are already hashed upstream so no
secrets leak.

---

## 6. The `architecture_type` field and how it is stamped

`architecture_type` is the identity that distinguishes this repository's records from the future
baseline's.

- **The manifest is the source of identity.** `generate-run-manifest.ts` reads `ARCHITECTURE_TYPE`
  (defaulting to `TOM` via `scripts/metrics/lib/env.ts`) and writes `architectureType` into the
  manifest.
- **Processors join by `run_id`.** Each processor loads the manifests, indexes them by `run_id`, and
  stamps `architecture_type` (and the other common columns) onto every row whose `run_id` matches.
- **Normalization happens only at the metrics layer.** Source emitters (API/visual contract writers,
  Gatling, the router/proxy) are not modified; `architecture_type` is applied entirely downstream.
- **Default is `TOM`.** With no manifest and no env override, the resolver still defaults
  `architecture_type` to `TOM`, so a pure local run is still correctly attributed.

---

## 7. Pairing with the future gTAA baseline

The future gTAA baseline repository uses this same schema unchanged and emits
`architecture_type = GTAA_BASELINE`. Runs are paired by **`experiment_batch_id` + `run_index`**: a TOM
batch and a baseline batch sharing one `experiment_batch_id`, with matched `run_index` values, form a
paired comparison on identical columns. TOM-only architectural overhead (router/proxy overhead) is
absent in the baseline and appears there as `null` / `NOT_AVAILABLE`, never as a fabricated value.

---

## 8. Quality-attribute metrics overview

Alongside the operational pipeline, a quality-attribute pipeline (`metrics:quality:*`) measures nine
architecture-quality attributes from **objective** evidence (repository files, git history, telemetry,
processed CSVs, CI artifacts — no surveys): Maintainability, Modifiability, Extensibility, Reusability,
Reliability, Performance Efficiency, Observability, Portability, and Interoperability.

Each `measure-*.ts` script writes a per-attribute CSV using the 15-column quality schema
(`metrics/schemas/quality-attribute-metric.schema.json`):

```
architecture_type, repository_name, experiment_batch_id, run_index, workflow_run_id,
workflow_attempt, tool_name, platform, viewport, metric_category, metric_name, metric_value,
metric_unit, source_file, generated_at
```

`build-quality-attribute-summary.ts` merges the per-attribute CSVs into
`metrics/processed/quality_attribute_metrics.csv` and renders
`metrics/summary/quality_attribute_summary.{md,json}` and
`metrics/summary/article_quality_attributes.md`. The operational definitions and interpretation rules
for each attribute live in the generated `metrics/summary/article_quality_attributes.md`; a dedicated
`docs/research/quality-attribute-measurement-model.md` companion is planned for the full narrative.

---

## 9. Metric interpretation rules and missing-data handling

- **Never fabricate.** A metric that cannot be computed is recorded as `null`, `UNKNOWN`, or
  `NOT_AVAILABLE` — never as a guessed or zero-filled value. Quality records that cannot be measured
  emit a row with `metric_value = NOT_AVAILABLE` and a `source_file` note explaining why.
- **Determinism.** Rows are sorted and columns are fixed; row bodies do not embed wall-clock
  timestamps. `generated_at` comes from the manifest's `generatedAt` or the `GENERATED_AT` env so
  reruns over the same inputs are byte-stable.
- **One failed metric never aborts the pipeline.** Operational processors wrap their body in
  try/catch and fall back to a headers-only CSV; quality scripts use the shared `safeMain` wrapper
  that logs a warning and still exits 0. Only run-manifest generation fails hard, and only when a run
  id cannot be produced at all.
- **`null` vs `UNKNOWN` vs `NOT_AVAILABLE`.** `null`/empty means the field legitimately has no value
  for this row (e.g. `failure_bucket` on a non-failure). `UNKNOWN` means an identity field could not
  be resolved from manifest or environment. `NOT_AVAILABLE` means a metric is defined but its evidence
  was absent in this run (e.g. cross-run reliability with a single `run_index`, or git-diff metrics
  with no base ref).

---

## 10. Artifact upload strategy

Every parse / normalize / manifest / upload step runs with `if: always()`, so a failing test still
surfaces its metrics. Each tool job uploads `tom-metrics-<tool>-<run_id>` bundling `metrics/`,
`results/`, `logs/`, `visual-results/`, and `target/gatling/`. The final `consolidate` job
(`if: always()`) downloads all per-tool artifacts, runs the full pipeline, and uploads
`tom-metrics-consolidated-<run_id>`. Run ids are deterministic per `scripts/metrics/lib/env.ts`
(`TOM_RUN_ID` if set, else `tom-<github_run_id>-<github_run_attempt>-<tool_name>-<timestamp>`). See
`tom-quantitative-protocol.md` §3 and §7 for the jobs and the workflow's current implementation state.

---

## Related documents

- `docs/research/tom-quantitative-protocol.md` — purpose, tools, jobs, run-manifest field meanings,
  100-execution protocol, gTAA schema reuse, threats to validity.
- `metrics/summary/article_tables.md`, `metrics/summary/article_quality_attributes.md` — generated
  outputs showing the real table shapes.
