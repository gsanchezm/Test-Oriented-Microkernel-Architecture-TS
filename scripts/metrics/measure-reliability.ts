// Architecture-quality: Reliability.
// Derives pass/fail rates, flakiness, and transition probabilities from accumulated
// scenario outcome history, plus infrastructure/tool failure rates from failure buckets.
// Missing evidence -> NOT_AVAILABLE; genuinely-undefined probabilities -> null (empty cell).
import { join } from 'path';
import { writeQualityCsv, QualityRecord, safeMain, NA } from './lib/quality';
import { readCsv, round2 } from './lib/csv';
import { P } from './lib/paths';

const CATEGORY = 'Reliability';

function main(): void {
  const records: QualityRecord[] = [];

  const outcome = readCsv(join(P.processed, 'scenario_outcome_history.csv'));
  const buckets = readCsv(join(P.processed, 'failure_buckets.csv'));

  // Outcome value lives in `outcome` (Task 1.3) — tolerate `status` as a fallback name.
  const outcomeOf = (r: Record<string, string>): string =>
    (r.outcome || r.status || '').trim().toUpperCase();

  const total = outcome.length;
  const passes = outcome.filter((r) => outcomeOf(r) === 'PASS').length;
  const fails = outcome.filter((r) => outcomeOf(r) === 'FAIL').length;

  // --- pass_rate / fail_rate: NA when there is no outcome history ---
  records.push({
    metric_category: CATEGORY,
    metric_name: 'pass_rate',
    metric_value: total > 0 ? (round2(passes / total) as number) : NA,
    metric_unit: 'ratio',
    source_file: 'metrics/processed/scenario_outcome_history.csv',
  });
  records.push({
    metric_category: CATEGORY,
    metric_name: 'fail_rate',
    metric_value: total > 0 ? (round2(fails / total) as number) : NA,
    metric_unit: 'ratio',
    source_file: 'metrics/processed/scenario_outcome_history.csv',
  });

  // --- Group by (scenario, tool_name, platform); order by run_index for transitions ---
  const groups = new Map<string, Record<string, string>[]>();
  for (const r of outcome) {
    const scenario = r.scenario || r.scenario_name || '';
    const key = `${scenario}::${r.tool_name || ''}::${r.platform || ''}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }

  let flakyCount = 0;
  let passToFail = 0;
  let totalPassTransitions = 0; // # of PASS observations that have a successor
  let failToPass = 0;
  let totalFailTransitions = 0; // # of FAIL observations that have a successor

  for (const rows of groups.values()) {
    const ordered = [...rows].sort((a, b) =>
      String(a.run_index || '').localeCompare(String(b.run_index || '')),
    );
    const seq = ordered.map(outcomeOf);
    if (seq.includes('PASS') && seq.includes('FAIL')) flakyCount += 1;

    if (seq.length >= 2) {
      for (let i = 0; i < seq.length - 1; i++) {
        const cur = seq[i];
        const next = seq[i + 1];
        if (cur === 'PASS') {
          totalPassTransitions += 1;
          if (next === 'FAIL') passToFail += 1;
        } else if (cur === 'FAIL') {
          totalFailTransitions += 1;
          if (next === 'PASS') failToPass += 1;
        }
      }
    }
  }

  records.push({
    metric_category: CATEGORY,
    metric_name: 'flaky_scenario_count',
    metric_value: flakyCount,
    metric_unit: 'count',
    source_file: 'metrics/processed/scenario_outcome_history.csv',
  });

  // Transition probabilities: null (undefined) when no qualifying transitions exist.
  records.push({
    metric_category: CATEGORY,
    metric_name: 'pass_to_fail_probability',
    metric_value: totalPassTransitions > 0 ? (round2(passToFail / totalPassTransitions) as number) : null,
    metric_unit: 'ratio',
    source_file: 'metrics/processed/scenario_outcome_history.csv',
  });
  records.push({
    metric_category: CATEGORY,
    metric_name: 'fail_to_pass_probability',
    metric_value: totalFailTransitions > 0 ? (round2(failToPass / totalFailTransitions) as number) : null,
    metric_unit: 'ratio',
    source_file: 'metrics/processed/scenario_outcome_history.csv',
  });

  // retry_count: not tracked upstream -> NA.
  records.push({
    metric_category: CATEGORY,
    metric_name: 'retry_count',
    metric_value: NA,
    metric_unit: 'count',
    source_file: 'not measured upstream',
  });

  // --- Failure-bucket distribution -> infrastructure / tool failure rates ---
  // Needs failure_buckets.csv. Rate is over total outcome observations.
  if (buckets.length === 0 || total === 0) {
    records.push({
      metric_category: CATEGORY,
      metric_name: 'infrastructure_failure_rate',
      metric_value: NA,
      metric_unit: 'ratio',
      source_file: 'metrics/processed/failure_buckets.csv',
    });
    records.push({
      metric_category: CATEGORY,
      metric_name: 'tool_failure_rate',
      metric_value: NA,
      metric_unit: 'ratio',
      source_file: 'metrics/processed/failure_buckets.csv',
    });
  } else {
    const bucketOf = (r: Record<string, string>): string =>
      (r.failure_bucket || '').trim().toUpperCase();
    // Infrastructure: explicit INFRASTRUCTURE_FAILURE bucket.
    const infra = buckets.filter((r) => bucketOf(r) === 'INFRASTRUCTURE_FAILURE').length;
    // Tool failures: session/driver-level failures attributable to a tool (not assertion/data).
    const TOOL_BUCKETS = new Set([
      'WEB_SESSION_FAILURE',
      'MOBILE_SESSION_FAILURE',
      'LOCATOR_RESOLUTION_FAILURE',
    ]);
    const toolFails = buckets.filter((r) => TOOL_BUCKETS.has(bucketOf(r))).length;
    records.push({
      metric_category: CATEGORY,
      metric_name: 'infrastructure_failure_rate',
      metric_value: round2(infra / total) as number,
      metric_unit: 'ratio',
      source_file: 'metrics/processed/failure_buckets.csv (INFRASTRUCTURE_FAILURE / total observations)',
    });
    records.push({
      metric_category: CATEGORY,
      metric_name: 'tool_failure_rate',
      metric_value: round2(toolFails / total) as number,
      metric_unit: 'ratio',
      source_file:
        'metrics/processed/failure_buckets.csv (WEB/MOBILE_SESSION + LOCATOR_RESOLUTION / total observations)',
    });
  }

  writeQualityCsv(join(P.processed, 'reliability_metrics.csv'), records);
  console.log(`[measure-reliability] wrote ${records.length} records`);
}

safeMain('measure-reliability', main);
