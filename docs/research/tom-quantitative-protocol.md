# TOM Quantitative Protocol

This document describes the **already-implemented** quantitative metrics pipeline for the
Test-Oriented Microkernel (TOM) repository. It explains what the pipeline measures, where the data
lives, how to reproduce an experimental run, and how the same schema will later be reused by a
gTAA baseline repository for a paired comparison.

All metric records emitted by this repository carry `architecture_type = TOM`.

---

## 1. Purpose

The pipeline makes the TOM architecture **quantitatively measurable** so it can produce objective,
reproducible experimental evidence about cross-platform test automation. It draws exclusively on
objective evidence already produced by the framework — Cucumber JSON reports, per-step telemetry,
API/visual contract telemetry, Gatling summaries, proxy overhead logs, and repository/git state —
and never fabricates a value. Missing data is represented as `null`, `UNKNOWN`, or `NOT_AVAILABLE`.

The same metrics schema is designed to be reused, **unchanged**, by a future gTAA baseline
repository so that two architectures can be compared on identical columns. In this repository every
record stamps `architecture_type = TOM`; the baseline will stamp `architecture_type = GTAA_BASELINE`.

---

## 2. Tools included

The pipeline normalizes results across the following execution tools:

| Tool name | Scope |
|---|---|
| `playwright-desktop` | Web UI, desktop viewport |
| `playwright-responsive` | Web UI, responsive viewport |
| `appium-android` | Mobile UI, Android |
| `appium-ios` | Mobile UI, iOS |
| `api` | API / contract-level execution (no UI) |
| `gatling` | Performance / load simulations |
| `pixelmatch-desktop` | Visual comparison, desktop viewport |
| `pixelmatch-responsive` | Visual comparison, responsive viewport |

**MobileWright (mobile UI via Playwright) is explicitly excluded** from this metrics matrix for now.
The driver migration path exists in the framework, but it is not one of the normalized tools in this
study.

---

## 3. Jobs included

Execution is defined in the workflow `.github/workflows/tom-quantitative-execution.yml` (named
*TOM — Quantitative Execution*), triggered by `workflow_dispatch` and by `push` / `pull_request` to
`main`.

It runs **8 tool-normalized jobs** plus a final **consolidate** job:

| Job | Display name | Tool |
|---|---|---|
| `api` | API | `api` |
| `playwright-desktop` | Playwright — Desktop | `playwright-desktop` |
| `playwright-responsive` | Playwright — Responsive | `playwright-responsive` |
| `pixelmatch-desktop` | Pixelmatch — Desktop | `pixelmatch-desktop` |
| `pixelmatch-responsive` | Pixelmatch — Responsive | `pixelmatch-responsive` |
| `appium-android` | Appium — Android | `appium-android` |
| `appium-ios` | Appium — iOS | `appium-ios` |
| `gatling` | Gatling | `gatling` |
| `consolidate` | Consolidate | `ALL` |

Each tool job sets `RUN_STARTED_AT` before tests and `RUN_ENDED_AT` after, generates its run manifest
(`metrics:manifest`), executes its slice, and then runs the metrics pipeline (`metrics:all`). The
Pixelmatch jobs may depend on their Playwright sibling and set `VISUAL_UPDATE_BASELINE=false` so that
comparison never updates baselines. The `consolidate` job downloads every per-tool artifact and runs
the full operational + quality pipeline (`metrics:experiment`).

> **Note (current state):** the operational scripts, quality scripts, JSON schemas, `package.json`
> script surface, and committed summaries are all implemented and verified. The
> `tom-quantitative-execution.yml` workflow is fully specified (jobs, env, artifacts) but is not yet
> present in `.github/workflows/`; the directory currently contains the existing full-execution
> workflow, the page-deploy workflow, and the visual-baseline-update workflow. This document
> describes the workflow as designed so the metrics it drives are documented end to end.

---

## 4. Raw metrics

Raw inputs live under `metrics/raw/`. Each is JSONL (one record per line) unless noted. The producer
is the component that writes the file.

| Raw path | Producer |
|---|---|
| `metrics/raw/run-manifest/<run-id>.json` | `scripts/metrics/generate-run-manifest.ts` |
| `metrics/raw/cucumber-jsonl/<run-id>.jsonl` | `scripts/metrics/normalize-telemetry.ts` (from `reports/*.json`) |
| `metrics/raw/tool-events/<run-id>.jsonl` | `scripts/metrics/normalize-telemetry.ts` (from `results/run-*/telemetry.jsonl`) |
| `metrics/raw/api/<run-id>.jsonl` | `src/core/contracts/contract-telemetry-writer.ts` (unchanged emitter) |
| `metrics/raw/visual/<run-id>.jsonl` | Pixelmatch visual telemetry (`src/plugins/pixelmatch/support/visual-telemetry.ts`, unchanged emitter) |
| `metrics/raw/gatling/<id>/summary.json` | Gatling action emitter (`src/plugins/gatling/actions/RunCheckoutLoad.ts`, unchanged) |
| `metrics/raw/proxy-jsonl/<run-id>.jsonl` | `scripts/metrics/compute-proxy-overhead.ts` (scraped from `logs/<tool>/proxy.log`) |

The `api`, `visual`, and `gatling` raw files are written by the **existing** framework emitters and
are not modified by the metrics layer. The manifest, cucumber-jsonl, tool-events, and proxy-jsonl raw
files are produced by metrics scripts. The router/proxy itself is never edited; proxy overhead is
recovered by scraping its stdout log.

---

## 5. Processed metrics

The operational processors emit **10 CSVs** to `metrics/processed/`:

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

`build-article-tables.ts` reads these and renders `metrics/summary/article_tables.md` plus
`metrics/summary/experiment_summary.json`.

Each processor is deterministic (stable column order, sorted rows), writes a headers-only CSV when
there is no input, and never aborts the rest of the pipeline on its own failure.

A parallel **quality-attribute** pipeline (`metrics:quality:*`) produces nine per-attribute CSVs and a
merged `quality_attribute_metrics.csv`, summarized in
`metrics/summary/article_quality_attributes.md`. See the companion `metrics-protocol.md` for the
quality-attribute overview.

---

## 6. Run manifest fields

Each job writes exactly one run manifest, the single source of experimental identity. The schema is
`metrics/schemas/run-manifest.schema.json`. Fields:

| Field | Notes |
|---|---|
| `schemaVersion` | manifest schema version (e.g. `1.0.0`) |
| `runId` | unique run id (see §7); minimum length 1 |
| `architectureType` | `TOM` here; `GTAA_BASELINE` in the future baseline |
| `experimentBatchId` | groups a batch of repeated runs |
| `runIndex` | the index within a batch (e.g. `001`) |
| `repositoryName` | repository identifier (nullable) |
| `workflowName` | CI workflow name (nullable) |
| `workflowRunId` | CI run id (nullable) |
| `workflowAttempt` | CI attempt (nullable) |
| `jobName` | CI job name (nullable) |
| `toolName` | normalized tool (nullable) |
| `platform` | platform under test |
| `viewport` | viewport (nullable) |
| `driver` | execution driver (nullable) |
| `commitSha` | commit under test (nullable) |
| `branch` | branch (nullable) |
| `generatedAt` | ISO date-time the manifest was generated |
| `startedAt` | run start (nullable) |
| `endedAt` | run end (nullable) |
| `ciProvider` | e.g. `github` (nullable) |
| `ciRunId` | CI provider run id (nullable) |
| `tags` | array of strings |
| `environment` | environment label (nullable) |
| `nodeVersion` | Node version (nullable) |
| `os` | OS platform (nullable) |

Every processor loads the available manifest(s), indexes by `run_id`, and stamps the common
experimental columns onto every output row joined by `run_id`. When a row's `run_id` has no manifest
(a pure local run), the processor falls back to environment variables, then to `UNKNOWN` / `null`.
This is how `architecture_type = TOM` reaches all metrics without modifying any emitter.

---

## 7. Artifact upload strategy

Every parse / normalize / manifest / upload step in the workflow runs with `if: always()` so that a
failing test never suppresses its metrics. Each tool job uploads a per-tool artifact named
`tom-metrics-<tool>-<run_id>` bundling `metrics/`, `results/`, `logs/`, `visual-results/`, and
`target/gatling/`. The final `consolidate` job (`needs` all tool jobs, also `if: always()`) downloads
every per-tool artifact, runs the full pipeline, and uploads a single consolidated artifact named
`tom-metrics-consolidated-<run_id>`.

Run ids are deterministic: `TOM_RUN_ID` if set, otherwise
`tom-<github_run_id>-<github_run_attempt>-<tool_name>-<timestamp>` (see
`scripts/metrics/lib/env.ts`). The workflow sets a deterministic `TOM_RUN_ID` per job so the manifest
and every artifact share one attributable id.

---

## 8. How to run 100 experimental executions

Reliability and stability metrics require **repeated** runs aggregated together. The protocol for a
100-run experiment:

1. Choose a fixed `experiment_batch_id` (for example `batch-001`) and keep it constant across all 100
   dispatches.
2. Dispatch `tom-quantitative-execution.yml` 100 times with `run_index` cycling `001` … `100`. Each
   dispatch is one repeated execution of the same batch.
3. Each `run_index` produces its own attributable run manifest per job, so every CSV row is traceable
   to `(experiment_batch_id, run_index, run_id)`.
4. After the runs, aggregate the per-run artifacts (the consolidated `tom-metrics-consolidated-*`
   bundles) into one `metrics/raw/` + `metrics/processed/` tree and re-run the pipeline over the
   union.

This can be driven as a loop of workflow dispatches or as a matrix of dispatches; the only invariant
is that `experiment_batch_id` is constant and `run_index` is unique per execution.

**Reliability is cross-run by construction:** flaky-scenario detection and pass→fail / fail→pass
transition probabilities need **≥ 2 aggregated `run_index` values**. A single run yields
`flaky = 0` and `null` transition probabilities — that is correct behavior, not missing data.

---

## 9. How the future gTAA baseline reuses the same schema

The future gTAA baseline repository reuses this exact measurement model with **no schema changes**:

- It emits `architecture_type = GTAA_BASELINE` instead of `TOM`.
- It uses the **same** run-manifest fields and the **same** CSV column sets (including the 15 common
  experimental columns and the quality-attribute columns).
- Runs are **paired by `experiment_batch_id`**: a TOM batch and a baseline batch sharing the same
  `experiment_batch_id` (and matched `run_index` values) form a paired comparison.
- TOM-only architectural overhead metrics — notably the router/proxy overhead reported in
  `proxy_overhead_summary.csv` and surfaced separately in the performance-efficiency quality CSV — do
  not exist in the baseline; there they become `null` / `NOT_AVAILABLE` rather than fabricated zeros.

Because the schemas, columns, and manifest fields are identical, the two repositories can be loaded
into one analysis and compared directly.

---

## 10. Threats to validity

- **CI variance.** Shared CI runners introduce timing noise. Performance-efficiency metrics are
  reported as p50/p95/p99 across repeated runs rather than single samples, but absolute durations
  remain runner-dependent.
- **Environment-specific configuration.** Pinned container images, emulator/simulator availability,
  and device caps differ across environments; portability and reliability numbers must be read
  against the configuration that produced them.
- **Heuristic duplicated-LOC.** The maintainability duplicated-LOC measure is a normalized-line-hash
  heuristic, not a semantic clone detector; cyclomatic complexity is reported `NOT_AVAILABLE` unless a
  dedicated pass is added.
- **Single-run reliability.** With only one `run_index`, flakiness and transition probabilities are
  not estimable (flaky = 0, transitions = `null`). Treat single-run reliability as a lower bound, not
  a measurement.
- **Router/proxy overhead is TOM-specific architectural overhead.** It is a property of the microkernel
  routing layer that the baseline does not have. It is **reported separately** (never folded into the
  primary duration figures) so that the architectural trade-off is visible rather than hidden.

---

## Related documents

- `docs/research/metrics-protocol.md` — failure buckets, the `architecture_type` stamping mechanism,
  gTAA pairing, quality-attribute overview, and missing-data handling.
- `metrics/summary/article_tables.md` and `metrics/summary/article_quality_attributes.md` —
  generated outputs showing the real table shapes.
