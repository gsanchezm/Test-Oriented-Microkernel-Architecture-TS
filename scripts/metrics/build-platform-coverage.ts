// Task 1.2 — platform coverage matrix.
// Same dependency-free feature parse as the inventory script (inlined to keep the
// deliverable self-contained), mapping tags -> platform booleans per scenario.
import { writeCsv } from './lib/csv';
import { P, ensureDir } from './lib/paths';
import {
  COMMON_COLUMNS,
  commonColumns,
  loadManifests,
  indexByRunId,
  representativeManifest,
} from './lib/manifest';
import { parseAllFeatures } from './lib/feature-parse';
import { safeMain } from './lib/run';
import { join } from 'path';

const PLATFORM_TAGS: Array<[string, string]> = [
  ['desktop', '@desktop'],
  ['responsive', '@responsive'],
  ['android', '@android'],
  ['ios', '@ios'],
  ['api', '@api'],
  ['performance', '@performance'],
  ['visual', '@visual'],
];

const COLUMNS = [
  ...COMMON_COLUMNS,
  'feature_file',
  'feature_name',
  'scenario_name',
  'desktop',
  'responsive',
  'android',
  'ios',
  'api',
  'performance',
  'visual',
  'total_platforms',
];

safeMain('build-platform-coverage', () => {
  const manifests = loadManifests();
  const idx = indexByRunId(manifests);
  const repRunId = representativeManifest(manifests)?.runId ?? '';
  const common = commonColumns(repRunId, idx);

  const scenarios = parseAllFeatures(P.features);

  const rows = scenarios.map((s) => {
    const tagSet = new Set(s.tags);
    const flags: Record<string, string> = {};
    let total = 0;
    for (const [col, tag] of PLATFORM_TAGS) {
      const on = tagSet.has(tag);
      flags[col] = on ? 'YES' : '';
      if (on) total += 1;
    }
    return {
      ...common,
      tool_name: 'ALL',
      platform: 'ALL',
      viewport: 'ALL',
      status: 'UNKNOWN',
      feature_file: s.featureFile,
      feature_name: s.featureName,
      scenario_name: s.scenarioName,
      ...flags,
      total_platforms: total,
    };
  });

  ensureDir(P.processed);
  const out = join(P.processed, 'platform_coverage_matrix.csv');
  writeCsv(out, COLUMNS, rows);
  console.log(`[build-platform-coverage] wrote ${rows.length} rows -> ${out}`);
});
