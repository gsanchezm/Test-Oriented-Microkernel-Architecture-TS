// Architecture-quality: Reusability.
// Measures how much of the test architecture (scenarios, contracts, steps, data)
// is shared/reused across platforms and tools. File counts are real, repo-derived
// evidence; ratios that need runtime outcome history degrade to NOT_AVAILABLE when
// the operational CSVs are absent (never fabricated, never NaN).
import { join } from 'path';
import { writeQualityCsv, QualityRecord, safeMain, NA } from './lib/quality';
import { readCsv, round2 } from './lib/csv';
import { P, walk } from './lib/paths';

const CATEGORY = 'Reusability';

/** number | null -> ratio; 0 denominator -> NA (never NaN). */
function ratioOrNA(num: number, den: number): number | string {
  if (den <= 0) return NA;
  return round2(num / den) as number;
}

function toNum(v: string | undefined): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function main(): void {
  const records: QualityRecord[] = [];

  const inventory = readCsv(join(P.processed, 'scenario_inventory.csv'));
  const coverage = readCsv(join(P.processed, 'platform_coverage_matrix.csv'));
  const outcome = readCsv(join(P.processed, 'scenario_outcome_history.csv'));

  // --- scenario_reuse_ratio: scenarios reused on >1 platform / total scenarios ---
  // Prefer the coverage matrix (carries total_platforms); fall back to inventory count.
  const totalScenarios = coverage.length > 0 ? coverage.length : inventory.length;
  const multiPlatform = coverage.filter((r) => toNum(r.total_platforms) > 1).length;
  records.push({
    metric_category: CATEGORY,
    metric_name: 'scenario_reuse_ratio',
    metric_value: ratioOrNA(multiPlatform, totalScenarios),
    metric_unit: 'ratio',
    source_file: 'metrics/processed/platform_coverage_matrix.csv',
  });

  // --- feature_to_tool_coverage: executed (feature,tool) pairs / expected (feature,tool) pairs ---
  // BOTH sides are counted in the SAME unit — distinct (feature_file, tool) pairs — so the ratio is
  // bounded in [0,1] and meaningful. Expected pairs are derived from each feature's tags
  // (tag -> tool). Executed pairs need real tool attribution in the outcome history; when tool_name
  // is absent/UNKNOWN (no run manifest joined) the metric degrades to NOT_AVAILABLE rather than
  // reporting a misleading number.
  const TAG_TO_TOOL: Record<string, string> = {
    '@desktop': 'playwright',
    '@responsive': 'playwright',
    '@android': 'appium-android',
    '@ios': 'appium-ios',
    '@api': 'api',
    '@performance': 'gatling',
    '@visual': 'pixelmatch',
  };
  const expectedPairSet = new Set<string>();
  for (const r of inventory) {
    const feature = r.feature_file || '';
    if (!feature) continue;
    for (const tag of (r.tags || '').split(/\s+/)) {
      const tool = TAG_TO_TOOL[tag];
      if (tool) expectedPairSet.add(`${feature}::${tool}`);
    }
  }
  const executedPairSet = new Set<string>();
  for (const r of outcome) {
    const feature = r.feature || r.feature_file || '';
    const tool = (r.tool_name || '').trim();
    if (feature && tool && tool !== 'UNKNOWN' && tool !== 'ALL') {
      executedPairSet.add(`${feature}::${tool}`);
    }
  }
  const featureToolCoverage: number | string =
    expectedPairSet.size <= 0 || executedPairSet.size === 0
      ? NA // no expected pairs, or no real tool attribution available -> not computable
      : ratioOrNA(executedPairSet.size, expectedPairSet.size);
  records.push({
    metric_category: CATEGORY,
    metric_name: 'feature_to_tool_coverage',
    metric_value: featureToolCoverage,
    metric_unit: 'ratio',
    source_file:
      'executed (feature,tool) pairs / expected (feature,tool) pairs from tags; NA when tool attribution absent',
  });

  // --- File-count reuse metrics (real, repo-derived) ---
  const featureFiles = (suffix: string): number =>
    walk(P.features, suffix).filter((f) => !f.endsWith('.gitkeep')).length;

  // step_definitions files under src/core/tests/**/step_definitions
  const stepFiles = walk(P.features, '.ts').filter((f) =>
    f.split('\\').join('/').includes('/step_definitions/'),
  ).length;
  records.push({
    metric_category: CATEGORY,
    metric_name: 'shared_step_reuse_count',
    metric_value: stepFiles,
    metric_unit: 'count',
    source_file: 'heuristic: src/core/tests/**/step_definitions/*.ts file count',
  });

  const locatorCount = featureFiles('.locators.json');
  const apiContractCount = featureFiles('.api.contract.json');
  const visualContractCount = featureFiles('.visual.json');
  const sharedContractCount = locatorCount + apiContractCount + visualContractCount;

  records.push({
    metric_category: CATEGORY,
    metric_name: 'shared_contract_reuse_count',
    metric_value: sharedContractCount,
    metric_unit: 'count',
    source_file: 'heuristic: all contract files under src/core/tests/**/contracts/**',
  });
  records.push({
    metric_category: CATEGORY,
    metric_name: 'locator_contract_reuse_count',
    metric_value: locatorCount,
    metric_unit: 'count',
    source_file: 'heuristic: *.locators.json under src/core/tests/**/contracts/**',
  });
  records.push({
    metric_category: CATEGORY,
    metric_name: 'api_contract_reuse_count',
    metric_value: apiContractCount,
    metric_unit: 'count',
    source_file: 'heuristic: *.api.contract.json under src/core/tests/**/contracts/**',
  });
  records.push({
    metric_category: CATEGORY,
    metric_name: 'visual_contract_reuse_count',
    metric_value: visualContractCount,
    metric_unit: 'count',
    source_file: 'heuristic: *.visual.json under src/core/tests/**/contracts/**',
  });

  // test_data_reuse_count: data-access + fixture/data files under the test slices (excludes .gitkeep)
  const testDataCount = walk(P.features)
    .filter((f) => !f.endsWith('.gitkeep'))
    .map((f) => f.split('\\').join('/'))
    .filter((f) => f.includes('/resonance/') || f.includes('/dao/')).length;
  records.push({
    metric_category: CATEGORY,
    metric_name: 'test_data_reuse_count',
    metric_value: testDataCount,
    metric_unit: 'count',
    source_file: 'heuristic: data-access and fixture/data files under the test slices (excl .gitkeep)',
  });

  writeQualityCsv(join(P.processed, 'reusability_metrics.csv'), records);
  console.log(`[measure-reusability] wrote ${records.length} records`);
}

safeMain('measure-reusability', main);
