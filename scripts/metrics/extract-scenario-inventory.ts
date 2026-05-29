// Task 1.1 — scenario inventory.
// Parses every *.feature under src/core/tests with a dependency-free line parser
// (@cucumber/gherkin is not resolvable under pnpm here) and emits one row per scenario.
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

const COLUMNS = [
  ...COMMON_COLUMNS,
  'feature_file',
  'feature_name',
  'scenario_name',
  'scenario_type',
  'tags',
  'example_rows',
  'step_count',
];

safeMain('extract-scenario-inventory', () => {
  const manifests = loadManifests();
  const idx = indexByRunId(manifests);
  const repRunId = representativeManifest(manifests)?.runId ?? '';
  const common = commonColumns(repRunId, idx);

  const scenarios = parseAllFeatures(P.features);

  const rows = scenarios.map((s) => ({
    ...common,
    tool_name: 'ALL',
    platform: 'ALL',
    viewport: 'ALL',
    status: 'UNKNOWN',
    feature_file: s.featureFile,
    feature_name: s.featureName,
    scenario_name: s.scenarioName,
    scenario_type: s.scenarioType,
    tags: s.tags.join(' '),
    example_rows: s.exampleRows,
    step_count: s.stepCount,
  }));

  ensureDir(P.processed);
  const out = join(P.processed, 'scenario_inventory.csv');
  writeCsv(out, COLUMNS, rows);
  console.log(`[extract-scenario-inventory] wrote ${rows.length} rows -> ${out}`);
});
