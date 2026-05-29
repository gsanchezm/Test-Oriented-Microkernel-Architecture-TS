# Quality Attribute Measurement Model

`architecture_type = TOM`. This document defines how the study quantifies the quality of the
**test automation architecture** itself. The same model is designed to apply, unchanged, to a future
baseline repository so the two architectures can be compared on identical, objective evidence.

## 1. What is being measured (and what is not)

The object of study is the **automation architecture** — the kernel/proxy, the per-tool plugins, the action
handlers and their registries, the routes, the contracts, the telemetry pipeline, and the oracles — not the
quality of the OmniPizza application that the tests happen to exercise.

This distinction is deliberate:

- A defect in OmniPizza (a broken checkout endpoint, a mislabeled button) tells us about the *product under
  test*. It is irrelevant to whether the architecture is maintainable, extensible, observable, and so on.
- A property such as "adding a new execution tool touches few core files" or "every failure is automatically
  classified into a standardized bucket" is a property of the *architecture* and is what this study reports.

Consequently, every metric is derived from artifacts that describe the architecture and its execution
behavior — repository files, git history, the telemetry the framework emits, the processed CSVs built from
that telemetry, and CI artifacts — and never from assertions about the correctness of OmniPizza features.

## 2. Evidence policy: objective only

All metrics are computed from **objective evidence**:

- Repository files (file sizes, contract files, locator files, action handlers).
- Git history (`git log`, and `git diff` against a base ref when one is supplied).
- Telemetry emitted during execution (per-step tool events, API/visual contract telemetry, the Gatling
  performance summary, and the proxy's per-intent overhead records written to stdout/logs).
- Processed CSVs derived from that telemetry under `metrics/processed/`.
- CI artifact presence (uploaded logs, raw metrics, processed metrics).

There are **no surveys, ratings, or perception-based inputs**. Every reported value is reproducible from
committed scripts run against committed or archived data.

## 3. Why nine attributes, and why Security is excluded

The study evaluates nine quality attributes:

1. Maintainability
2. Modifiability
3. Extensibility
4. Reusability
5. Reliability
6. Performance Efficiency
7. Observability
8. Portability
9. Interoperability

**Security is intentionally excluded.** No security metrics are implemented in the measurement pipeline —
there is no `measure-security.ts` script and no security-category records are emitted. Reporting a Security
attribute with no underlying objective metric would violate the no-fabrication policy in Section 5. If
security metrics are added later, Security can be introduced as a tenth attribute with its own measurement
script; until then it is omitted rather than estimated.

## 4. Per-attribute measurement reference

Each attribute is produced by one `scripts/metrics/measure-<attribute>.ts` script that emits rows under a
single `metric_category` (shown below). The `metric_name` values listed are the exact strings emitted by the
corresponding script. Each row carries a `metric_value`, a `metric_unit`, and a `source_file`. Repository-level
metrics use `tool_name = ALL` and `platform = ALL`.

The condensed operational definitions and interpretation rules also appear in the generated article table
[`metrics/summary/article_quality_attributes.md`](../../metrics/summary/article_quality_attributes.md), which
this document expands on.

### 4.1 Maintainability — `metric_category: Maintainability`

**Operational definition.** The ability to understand, modify, debug, and maintain the automation
architecture.

| `metric_name` | unit | interpretation |
|---|---|---|
| `duplicated_loc` | loc | lower is better |
| `duplicated_code_percentage` | percent | lower is better |
| `files_touched_per_change` | files | lower is better (more localized changes) |
| `average_file_size_loc` | loc | lower is better (smaller, focused modules) |
| `max_file_size_loc` | loc | lower is better |
| `cyclomatic_complexity_if_available` | complexity | lower is better; emitted as `NOT_AVAILABLE` (no AST pass) |
| `failure_bucket_coverage_percentage` | percent | higher is better |
| `telemetry_completeness_percentage` | percent | higher is better |

**Evidence.** File sizes from `src/**/*.ts`; a normalized line-hash heuristic for duplication; failure-bucket
coverage from `metrics/processed/failure_buckets.csv`; telemetry completeness from
`metrics/raw/tool-events/*.jsonl`; `files_touched_per_change` from `git log` if available.

### 4.2 Modifiability — `metric_category: Modifiability`

**Operational definition.** The amount of existing architecture code affected by a change.

| `metric_name` | unit | interpretation |
|---|---|---|
| `core_files_modified` | files | lower is better |
| `execution_layer_files_modified` | files | lower is better |
| `adapter_files_modified` | files | context |
| `reporting_files_modified` | files | context |
| `configuration_files_modified` | files | context |
| `loc_added` | loc | context |
| `loc_deleted` | loc | context |
| `loc_modified` | loc | lower is better |
| `change_impact_score` | score | lower is better |

**Evidence.** `git diff <base>...HEAD` (requires `METRICS_BASE_REF`), with changed files classified into core /
execution / adapter / reporting / configuration. Without a base ref every value is emitted as `NOT_AVAILABLE`
rather than guessed.

### 4.3 Extensibility — `metric_category: Extensibility`

**Operational definition.** The ability to add new tools, oracles, or execution capabilities with localized
changes.

| `metric_name` | unit | interpretation |
|---|---|---|
| `new_tool_files_added` | files | context |
| `new_tool_files_modified` | files | context |
| `new_tool_loc_added` | loc | context |
| `existing_core_files_changed_for_new_tool` | files | lower is better |
| `new_action_or_adapter_count` | count | context |
| `registration_changes_count` | count | context |
| `integration_effort_proxy_score` | score | lower is better |

**Evidence.** Optional `metrics/raw/tool-integration/*.json` integration manifests, otherwise a `git diff`
against a base ref. Absent both, values are `NOT_AVAILABLE`.

### 4.4 Reusability — `metric_category: Reusability`

**Operational definition.** Reuse of scenarios, contracts, test data, and steps across tools and platforms.

| `metric_name` | unit | interpretation |
|---|---|---|
| `scenario_reuse_ratio` | ratio | higher is better |
| `feature_to_tool_coverage` | ratio | higher is better |
| `shared_step_reuse_count` | count | higher is better |
| `shared_contract_reuse_count` | count | higher is better |
| `locator_contract_reuse_count` | count | higher is better |
| `api_contract_reuse_count` | count | higher is better |
| `visual_contract_reuse_count` | count | higher is better |
| `test_data_reuse_count` | count | higher is better |

**Evidence.** `metrics/processed/scenario_inventory.csv` and `platform_coverage_matrix.csv` plus counts of
contract, locator, step-definition, and test-data files in the repository.

### 4.5 Reliability — `metric_category: Reliability`

**Operational definition.** The stability of repeated automation executions.

| `metric_name` | unit | interpretation |
|---|---|---|
| `pass_rate` | ratio | higher is better |
| `fail_rate` | ratio | lower is better |
| `flaky_scenario_count` | count | lower is better |
| `pass_to_fail_probability` | ratio | lower is better |
| `fail_to_pass_probability` | ratio | context (recovery behavior) |
| `retry_count` | count | lower is better; `NOT_AVAILABLE` unless measured upstream |
| `infrastructure_failure_rate` | ratio | lower is better |
| `tool_failure_rate` | ratio | lower is better |

**Evidence.** `metrics/processed/scenario_outcome_history.csv` and `failure_buckets.csv`. Transition
probabilities and flakiness require at least two runs (`run_index`); a single run yields `flaky=0` and `null`
transition probabilities.

### 4.6 Performance Efficiency — `metric_category: Performance Efficiency`

**Operational definition.** Execution efficiency under equivalent tool and CI conditions.

| `metric_name` | unit | interpretation |
|---|---|---|
| `scenario_duration_ms` | ms | lower is better (mean) |
| `p50_scenario_duration_ms` | ms | lower is better |
| `p95_scenario_duration_ms` | ms | lower is better |
| `p99_scenario_duration_ms` | ms | lower is better |
| `workflow_duration_ms` | ms | lower is better; `NOT_AVAILABLE` without manifest timing |
| `job_duration_ms` | ms | lower is better; `NOT_AVAILABLE` without manifest timing |
| `tool_startup_duration_ms` | ms | lower is better; `NOT_AVAILABLE` unless measured |
| `telemetry_processing_duration_ms` | ms | lower is better; `NOT_AVAILABLE` unless measured |
| `proxy_overhead_ms` | ms | architecture-specific overhead (see Section 6) |
| `grpc_or_ipc_latency_ms` | ms | architecture-specific overhead (see Section 6) |

**Evidence.** `scenario_durations.csv`, `platform_durations.csv`, `performance_summary.csv`, run manifests, and
`proxy_overhead_summary.csv`. The two overhead metrics are emitted as **separate rows** and are reported as an
architectural trade-off, not folded into total execution duration.

### 4.7 Observability — `metric_category: Observability`

**Operational definition.** The ability to explain execution behavior and to classify failures.

| `metric_name` | unit | interpretation |
|---|---|---|
| `telemetry_event_count` | count | higher is better (more execution evidence) |
| `telemetry_completeness_percentage` | percent | higher is better |
| `missing_run_manifest_count` | count | lower is better |
| `missing_scenario_duration_count` | count | lower is better |
| `missing_failure_bucket_count` | count | lower is better |
| `classified_failure_percentage` | percent | higher is better |
| `unclassified_failure_percentage` | percent | lower is better |
| `logs_uploaded` | boolean | higher (present) is better |
| `artifacts_uploaded` | boolean | higher (present) is better |
| `raw_metrics_uploaded` | boolean | higher (present) is better |
| `processed_metrics_uploaded` | boolean | higher (present) is better |

**Evidence.** Presence and completeness of telemetry under `metrics/raw/` and `metrics/processed/`, classified
versus unclassified failures in `failure_buckets.csv`, and the presence of CI artifact directories.

### 4.8 Portability — `metric_category: Portability`

**Operational definition.** The ability to execute consistently across tools, platforms, and environments.

| `metric_name` | unit | interpretation |
|---|---|---|
| `supported_tool_count` | count | higher is better |
| `successful_tool_count` | count | higher is better |
| `failed_tool_count` | count | lower is better |
| `platform_coverage_percentage` | percent | higher is better |
| `environment_specific_config_count` | count | context |
| `platform_specific_locator_count` | count | context |
| `platform_specific_code_count` | count | lower is better (less platform-coupled code) |
| `successful_platform_matrix_percentage` | percent | higher is better |

**Evidence.** `platform_coverage_matrix.csv`, `platform_durations.csv`, run manifests, and counts of
environment- and platform-specific files in `src/**`.

### 4.9 Interoperability — `metric_category: Interoperability`

**Operational definition.** The ability to integrate heterogeneous testing tools and composable oracles.

| `metric_name` | unit | interpretation |
|---|---|---|
| `tool_count` | count | higher is better |
| `oracle_count` | count | higher is better |
| `api_oracle_available` | boolean | higher (present) is better |
| `ui_oracle_available` | boolean | higher (present) is better |
| `visual_oracle_available` | boolean | higher (present) is better |
| `performance_oracle_available` | boolean | higher (present) is better |
| `oracle_composition_count` | count | higher is better |
| `successful_oracle_composition_count` | count | higher is better |

**Evidence.** Distinct tools and oracles observed in the processed evidence CSVs
(`api_isolated_results.csv`, `visual_comparison_results.csv`, `performance_summary.csv`, tool events) and the
oracle dimensions declared by scenario tags. Oracle types tracked: API, UI_WEB, UI_MOBILE, VISUAL_WEB,
VISUAL_MOBILE, PERFORMANCE.

## 5. No fabrication: missing data is explicit

A metric that cannot be computed from available evidence is **never invented or estimated**. Instead it is
recorded with an explicit sentinel:

- `null` (empty cell) — the quantity is genuinely absent for this run.
- `UNKNOWN` — an identity/context value could not be resolved.
- `NOT_AVAILABLE` — the metric requires an input or capability not present in this run (for example,
  `change_impact_score` without a base ref, or `cyclomatic_complexity_if_available` with no AST pass).

Every sentinel row carries a `source_file` note explaining why the value is unavailable, so a reader can
distinguish "measured as zero" from "not measurable here."

**One unavailable metric must not abort the pipeline.** Each measurement script wraps its work so that a
missing input produces an explicit sentinel row (and, where applicable, a headers-only CSV) and the run
continues. This keeps the dataset complete and comparable across runs: an attribute that lacks data in one
run is visibly marked rather than silently dropping rows or failing the whole pipeline.

## 6. Architecture-specific overhead is reported separately

`proxy_overhead_ms` and `grpc_or_ipc_latency_ms` measure the cost introduced by the kernel/proxy indirection
boundary and the inter-process transport between the proxy and the plugins. These are **specific to this
architecture**: a single-process baseline architecture has no equivalent indirection, so for that baseline
these metrics are expected to be `null`.

For that reason they are:

- Emitted as **separate Performance Efficiency rows**, each tagged in `source_file` as architecture-specific
  overhead.
- **Not** added into `scenario_duration_ms` or the percentile durations. Total execution duration and the
  indirection overhead are measured independently so the trade-off (the cost of composability and tool
  swappability) is reported transparently rather than hidden inside aggregate timing.

This lets the study present the overhead as an honest architectural trade-off and lets a future baseline
comparison hold scenario duration comparable while attributing the indirection cost only to the architecture
that incurs it.

## 7. Generated outputs

The per-attribute CSVs under `metrics/processed/` are merged into:

- `metrics/processed/quality_attribute_metrics.csv` — all attributes, one row per metric.
- [`metrics/summary/quality_attribute_summary.md`](../../metrics/summary/quality_attribute_summary.md) —
  one table per attribute (the latest run's values).
- [`metrics/summary/article_quality_attributes.md`](../../metrics/summary/article_quality_attributes.md) —
  the article table of operational definitions and interpretation rules referenced throughout this document.
