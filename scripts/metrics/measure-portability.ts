// Architecture-quality: Portability metrics for the TOM automation architecture.
// Evaluates how well the architecture supports multiple tools/platforms without
// platform-specific coupling. Repo-level (tool_name/platform = 'ALL').
//
// ts-node CommonJS, bare relative imports, no extensions, no '@' aliases.
import { join } from 'path';
import { readdirSync, statSync } from 'fs';
import { writeQualityCsv, QualityRecord, safeMain, NA } from './lib/quality';
import { P, walk, relPosix } from './lib/paths';
import { readCsv, round2 } from './lib/csv';

const CATEGORY = 'Portability';

// Known TOM tool set (8) — the supported automation tools.
const SUPPORTED_TOOLS = [
  'playwright-desktop',
  'playwright-responsive',
  'appium-android',
  'appium-ios',
  'api',
  'gatling',
  'pixelmatch-desktop',
  'pixelmatch-responsive',
];

function main(): void {
  const records: QualityRecord[] = [];

  // --- supported_tool_count: fixed known set ---
  records.push({
    metric_category: CATEGORY,
    metric_name: 'supported_tool_count',
    metric_value: SUPPORTED_TOOLS.length,
    metric_unit: 'count',
    source_file: 'scripts/metrics/measure-portability.ts (known TOM tool set)',
  });

  // --- successful / failed tool counts from scenario_outcome_history.csv ---
  const outcomePath = join(P.processed, 'scenario_outcome_history.csv');
  const outcomes = readCsv(outcomePath);
  const haveHistory = outcomes.length > 0;

  // Outcome column may be 'outcome' (per Phase 1.3) or 'status'.
  const outcomeOf = (r: Record<string, string>): string =>
    (r.outcome || r.status || '').toUpperCase();

  let successfulToolCount: string | number = NA;
  let failedToolCount: string | number = NA;
  if (haveHistory) {
    const passTools = new Set<string>();
    const allTools = new Set<string>();
    for (const r of outcomes) {
      const tool = r.tool_name;
      if (!tool || tool.trim() === '' || tool === 'UNKNOWN') continue;
      allTools.add(tool);
      if (outcomeOf(r) === 'PASS') passTools.add(tool);
    }
    successfulToolCount = passTools.size;
    failedToolCount = [...allTools].filter((t) => !passTools.has(t)).length;
  }
  records.push({
    metric_category: CATEGORY,
    metric_name: 'successful_tool_count',
    metric_value: successfulToolCount,
    metric_unit: 'count',
    source_file: haveHistory ? relPosix(outcomePath) : `${relPosix(outcomePath)} (no history)`,
  });
  records.push({
    metric_category: CATEGORY,
    metric_name: 'failed_tool_count',
    metric_value: failedToolCount,
    metric_unit: 'count',
    source_file: haveHistory ? relPosix(outcomePath) : `${relPosix(outcomePath)} (no history)`,
  });

  // --- platform_coverage_percentage: successful (platform,tool) pairs / expected pairs ---
  // Expected pairs come from platform_coverage_matrix.csv. NA if no history.
  const matrixPath = join(P.processed, 'platform_coverage_matrix.csv');
  const matrix = readCsv(matrixPath);
  let coveragePct: string | number = NA;
  if (haveHistory) {
    // Expected (platform,tool) pairs from the coverage matrix's boolean columns.
    const platformCols = [
      'desktop',
      'responsive',
      'android',
      'ios',
      'api',
      'performance',
      'visual',
    ];
    const expectedPairs = new Set<string>();
    for (const row of matrix) {
      for (const col of platformCols) {
        const v = (row[col] || '').trim().toUpperCase();
        if (v === 'YES' || v === 'TRUE' || v === '1') {
          expectedPairs.add(`${col}`);
        }
      }
    }
    // Successful pairs observed: (platform,tool) where at least one PASS exists.
    const successfulPairs = new Set<string>();
    for (const r of outcomes) {
      if (outcomeOf(r) !== 'PASS') continue;
      const platform = (r.platform || '').trim();
      if (platform && platform !== 'UNKNOWN' && platform !== 'ALL') {
        successfulPairs.add(platform);
      }
    }
    if (expectedPairs.size > 0) {
      const covered = [...successfulPairs].filter((p) => expectedPairs.has(p)).length;
      coveragePct = round2((covered / expectedPairs.size) * 100) ?? NA;
    } else {
      coveragePct = NA;
    }
  }
  records.push({
    metric_category: CATEGORY,
    metric_name: 'platform_coverage_percentage',
    metric_value: coveragePct,
    metric_unit: 'percent',
    source_file: haveHistory
      ? `${relPosix(matrixPath)}; ${relPosix(outcomePath)}`
      : `${relPosix(outcomePath)} (no history)`,
  });

  // --- environment_specific_config_count: capability/device/profile CONFIG files under src, plus *.env ---
  // "Be reasonable, count capability/profile config files": constrain the caps|profile heuristic to
  // config-like extensions (.json/.yml/.yaml/.env) under a caps|devices|profile path segment so the
  // count picks up real device/capability passports (src/devices/*.json) and not application test code
  // (the user-`profile` slice's *.ts/*.feature files, which would otherwise dominate the count).
  const srcFiles = walk(P.srcRoot);
  const configFiles = srcFiles.filter((f) => {
    const rel = relPosix(f);
    const isConfigExt = /\.(json|ya?ml|env)$/i.test(rel);
    const isEnvConfigPath = /(^|\/)(caps|capabilities|devices|profile|profiles)(\/|\.)/i.test(rel);
    return isConfigExt && isEnvConfigPath;
  });
  // *.env profiles live at the repo root — scan top-level entries only (avoid recursing node_modules).
  let envProfiles: string[] = [];
  try {
    envProfiles = readdirSync(P.repoRoot).filter((n) => {
      if (!/^\.env(\..+)?$|\.env$/i.test(n)) return false;
      try {
        return statSync(join(P.repoRoot, n)).isFile();
      } catch {
        return false;
      }
    });
  } catch {
    envProfiles = [];
  }
  const envConfigCount = configFiles.length + envProfiles.length;
  records.push({
    metric_category: CATEGORY,
    metric_name: 'environment_specific_config_count',
    metric_value: envConfigCount,
    metric_unit: 'count',
    source_file: 'src/** (caps|profile) + *.env profiles',
  });

  // --- platform_specific_locator_count: *.locators.json files (heuristic = total count) ---
  const locatorFiles = walk(P.srcRoot, '.json').filter((f) => f.endsWith('.locators.json'));
  records.push({
    metric_category: CATEGORY,
    metric_name: 'platform_specific_locator_count',
    metric_value: locatorFiles.length,
    metric_unit: 'count',
    source_file: 'src/**/*.locators.json',
  });

  // --- platform_specific_code_count: files under src with android/ios/mobile/web in path ---
  const platformCode = srcFiles.filter((f) =>
    /(android|ios|mobile|web)/i.test(relPosix(f)),
  ).length;
  records.push({
    metric_category: CATEGORY,
    metric_name: 'platform_specific_code_count',
    metric_value: platformCode,
    metric_unit: 'count',
    source_file: 'src/** (android|ios|mobile|web in path)',
  });

  // --- successful_platform_matrix_percentage: same basis as platform_coverage_percentage ---
  records.push({
    metric_category: CATEGORY,
    metric_name: 'successful_platform_matrix_percentage',
    metric_value: coveragePct,
    metric_unit: 'percent',
    source_file: haveHistory
      ? `${relPosix(matrixPath)}; ${relPosix(outcomePath)}`
      : `${relPosix(outcomePath)} (no history)`,
  });

  writeQualityCsv(join(P.processed, 'portability_metrics.csv'), records);
  console.log(`[measure-portability] wrote ${records.length} metrics`);
}

safeMain('measure-portability', main);
