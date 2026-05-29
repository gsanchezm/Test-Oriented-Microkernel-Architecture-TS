# TOM Quality Attribute Summary

architecture_type = **TOM**. These metrics evaluate the automation architecture, not the OmniPizza application under test.

## Maintainability

| Quality Attribute | Metric | Value | Unit | Tool | Source |
|---|---:|---:|---|---|---|
| Maintainability | average_file_size_loc | 71.27 | loc | ALL | src/**/*.ts |
| Maintainability | cyclomatic_complexity_if_available | NOT_AVAILABLE | complexity | ALL | no AST pass (heuristic unavailable) |
| Maintainability | duplicated_code_percentage | 8.34 | percent | ALL | src/**/*.ts |
| Maintainability | duplicated_loc | 1111 | loc | ALL | src/**/*.ts |
| Maintainability | failure_bucket_coverage_percentage | 100 | percent | ALL | metrics/processed/failure_buckets.csv |
| Maintainability | files_touched_per_change | 12.26 | files | ALL | git log |
| Maintainability | max_file_size_loc | 380 | loc | ALL | src/**/*.ts |
| Maintainability | telemetry_completeness_percentage | 100 | percent | ALL | metrics/raw/tool-events/*.jsonl |

## Modifiability

| Quality Attribute | Metric | Value | Unit | Tool | Source |
|---|---:|---:|---|---|---|
| Modifiability | adapter_files_modified | NOT_AVAILABLE | files | ALL | git diff unavailable (set METRICS_BASE_REF) |
| Modifiability | change_impact_score | NOT_AVAILABLE | score | ALL | git diff unavailable (set METRICS_BASE_REF) |
| Modifiability | configuration_files_modified | NOT_AVAILABLE | files | ALL | git diff unavailable (set METRICS_BASE_REF) |
| Modifiability | core_files_modified | NOT_AVAILABLE | files | ALL | git diff unavailable (set METRICS_BASE_REF) |
| Modifiability | execution_layer_files_modified | NOT_AVAILABLE | files | ALL | git diff unavailable (set METRICS_BASE_REF) |
| Modifiability | loc_added | NOT_AVAILABLE | loc | ALL | git diff unavailable (set METRICS_BASE_REF) |
| Modifiability | loc_deleted | NOT_AVAILABLE | loc | ALL | git diff unavailable (set METRICS_BASE_REF) |
| Modifiability | loc_modified | NOT_AVAILABLE | loc | ALL | git diff unavailable (set METRICS_BASE_REF) |
| Modifiability | reporting_files_modified | NOT_AVAILABLE | files | ALL | git diff unavailable (set METRICS_BASE_REF) |

## Extensibility

| Quality Attribute | Metric | Value | Unit | Tool | Source |
|---|---:|---:|---|---|---|
| Extensibility | existing_core_files_changed_for_new_tool | NOT_AVAILABLE | files | ALL | no tool-integration manifests; git diff unavailable (set METRICS_BASE_REF) |
| Extensibility | integration_effort_proxy_score | NOT_AVAILABLE | score | ALL | no tool-integration manifests; git diff unavailable (set METRICS_BASE_REF) |
| Extensibility | new_action_or_adapter_count | NOT_AVAILABLE | count | ALL | no tool-integration manifests; git diff unavailable (set METRICS_BASE_REF) |
| Extensibility | new_tool_files_added | NOT_AVAILABLE | files | ALL | no tool-integration manifests; git diff unavailable (set METRICS_BASE_REF) |
| Extensibility | new_tool_files_modified | NOT_AVAILABLE | files | ALL | no tool-integration manifests; git diff unavailable (set METRICS_BASE_REF) |
| Extensibility | new_tool_loc_added | NOT_AVAILABLE | loc | ALL | no tool-integration manifests; git diff unavailable (set METRICS_BASE_REF) |
| Extensibility | registration_changes_count | NOT_AVAILABLE | count | ALL | no tool-integration manifests; git diff unavailable (set METRICS_BASE_REF) |

## Reusability

| Quality Attribute | Metric | Value | Unit | Tool | Source |
|---|---:|---:|---|---|---|
| Reusability | api_contract_reuse_count | 6 | count | ALL | heuristic: *.api.contract.json under src/core/tests/**/contracts/** |
| Reusability | feature_to_tool_coverage | NOT_AVAILABLE | ratio | ALL | executed (feature,tool) pairs / expected (feature,tool) pairs from tags; NA when tool attribution absent |
| Reusability | locator_contract_reuse_count | 7 | count | ALL | heuristic: *.locators.json under src/core/tests/**/contracts/** |
| Reusability | scenario_reuse_ratio | 0.95 | ratio | ALL | metrics/processed/platform_coverage_matrix.csv |
| Reusability | shared_contract_reuse_count | 20 | count | ALL | heuristic: all contract files under src/core/tests/**/contracts/** |
| Reusability | shared_step_reuse_count | 14 | count | ALL | heuristic: src/core/tests/**/step_definitions/*.ts file count |
| Reusability | test_data_reuse_count | 22 | count | ALL | heuristic: data-access and fixture/data files under the test slices (excl .gitkeep) |
| Reusability | visual_contract_reuse_count | 7 | count | ALL | heuristic: *.visual.json under src/core/tests/**/contracts/** |

## Reliability

| Quality Attribute | Metric | Value | Unit | Tool | Source |
|---|---:|---:|---|---|---|
| Reliability | fail_rate | 0.17 | ratio | ALL | metrics/processed/scenario_outcome_history.csv |
| Reliability | fail_to_pass_probability | 0.78 | ratio | ALL | metrics/processed/scenario_outcome_history.csv |
| Reliability | flaky_scenario_count | 52 | count | ALL | metrics/processed/scenario_outcome_history.csv |
| Reliability | infrastructure_failure_rate | 0.1 | ratio | ALL | metrics/processed/failure_buckets.csv (INFRASTRUCTURE_FAILURE / total observations) |
| Reliability | pass_rate | 0.83 | ratio | ALL | metrics/processed/scenario_outcome_history.csv |
| Reliability | pass_to_fail_probability | 0.02 | ratio | ALL | metrics/processed/scenario_outcome_history.csv |
| Reliability | retry_count | NOT_AVAILABLE | count | ALL | not measured upstream |
| Reliability | tool_failure_rate | 0.05 | ratio | ALL | metrics/processed/failure_buckets.csv (WEB/MOBILE_SESSION + LOCATOR_RESOLUTION / total observations) |

## Performance Efficiency

| Quality Attribute | Metric | Value | Unit | Tool | Source |
|---|---:|---:|---|---|---|
| Performance Efficiency | grpc_or_ipc_latency_ms | 1.22 | ms | ALL | TOM-only overhead |
| Performance Efficiency | job_duration_ms | NOT_AVAILABLE | ms | ALL | metrics/raw/run-manifest/*.json (mean per-manifest endedAt - startedAt) |
| Performance Efficiency | p50_scenario_duration_ms | 1144 | ms | ALL | metrics/processed/scenario_durations.csv (p50 of duration_ms) |
| Performance Efficiency | p95_scenario_duration_ms | 66340 | ms | ALL | metrics/processed/scenario_durations.csv (p95 of duration_ms) |
| Performance Efficiency | p99_scenario_duration_ms | 132835 | ms | ALL | metrics/processed/scenario_durations.csv (p99 of duration_ms) |
| Performance Efficiency | proxy_overhead_ms | 0.05 | ms | ALL | TOM-only overhead |
| Performance Efficiency | scenario_duration_ms | 11634.99 | ms | ALL | metrics/processed/scenario_durations.csv (mean of duration_ms) |
| Performance Efficiency | telemetry_processing_duration_ms | NOT_AVAILABLE | ms | ALL | not measured upstream |
| Performance Efficiency | tool_startup_duration_ms | NOT_AVAILABLE | ms | ALL | not measured upstream |
| Performance Efficiency | workflow_duration_ms | NOT_AVAILABLE | ms | ALL | metrics/raw/run-manifest/*.json (max endedAt - min startedAt) |

## Observability

| Quality Attribute | Metric | Value | Unit | Tool | Source |
|---|---:|---:|---|---|---|
| Observability | artifacts_uploaded | 1 | boolean | ALL | metrics |
| Observability | classified_failure_percentage | 100 | percent | ALL | metrics/processed/failure_buckets.csv |
| Observability | logs_uploaded | 1 | boolean | ALL | logs |
| Observability | missing_failure_bucket_count | 0 | count | ALL | metrics/processed/failure_buckets.csv |
| Observability | missing_run_manifest_count | 26 | count | ALL | metrics/processed |
| Observability | missing_scenario_duration_count | 454 | count | ALL | metrics/processed/scenario_outcome_history.csv |
| Observability | processed_metrics_uploaded | 1 | boolean | ALL | metrics/processed |
| Observability | raw_metrics_uploaded | 1 | boolean | ALL | metrics/raw |
| Observability | telemetry_completeness_percentage | 0 | percent | ALL | metrics/raw/tool-events |
| Observability | telemetry_event_count | 3284 | count | ALL | metrics/raw/tool-events |
| Observability | unclassified_failure_percentage | 0 | percent | ALL | metrics/processed/failure_buckets.csv |

## Portability

| Quality Attribute | Metric | Value | Unit | Tool | Source |
|---|---:|---:|---|---|---|
| Portability | environment_specific_config_count | 12 | count | ALL | src/** (caps\|profile) + *.env profiles |
| Portability | failed_tool_count | 0 | count | ALL | metrics/processed/scenario_outcome_history.csv |
| Portability | platform_coverage_percentage | 0 | percent | ALL | metrics/processed/platform_coverage_matrix.csv; metrics/processed/scenario_outcome_history.csv |
| Portability | platform_specific_code_count | 14 | count | ALL | src/** (android\|ios\|mobile\|web in path) |
| Portability | platform_specific_locator_count | 7 | count | ALL | src/**/*.locators.json |
| Portability | successful_platform_matrix_percentage | 0 | percent | ALL | metrics/processed/platform_coverage_matrix.csv; metrics/processed/scenario_outcome_history.csv |
| Portability | successful_tool_count | 0 | count | ALL | metrics/processed/scenario_outcome_history.csv |
| Portability | supported_tool_count | 8 | count | ALL | scripts/metrics/measure-portability.ts (known TOM tool set) |

## Interoperability

| Quality Attribute | Metric | Value | Unit | Tool | Source |
|---|---:|---:|---|---|---|
| Interoperability | api_oracle_available | 0 | boolean | ALL | metrics/processed/api_isolated_results.csv |
| Interoperability | oracle_composition_count | 5 | count | ALL | src/core/tests (*.feature tags) |
| Interoperability | oracle_count | 2 | count | ALL | metrics/processed/{api_isolated_results,visual_comparison_results,performance_summary}.csv; tool-events |
| Interoperability | performance_oracle_available | 0 | boolean | ALL | metrics/processed/performance_summary.csv |
| Interoperability | successful_oracle_composition_count | 0 | count | ALL | src/core/tests + evidence CSVs |
| Interoperability | tool_count | 0 | count | ALL | metrics/processed/scenario_outcome_history.csv |
| Interoperability | ui_oracle_available | 1 | boolean | ALL | metrics/raw/tool-events; metrics/processed/scenario_outcome_history.csv |
| Interoperability | visual_oracle_available | 0 | boolean | ALL | metrics/processed/visual_comparison_results.csv |

