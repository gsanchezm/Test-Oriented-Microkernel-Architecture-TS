// Architecture-quality: Interoperability metrics for the TOM automation architecture.
// Evaluates how well distinct tools/oracles compose within a single architecture
// (multi-oracle scenarios, available oracle dimensions). Repo-level (tool_name/platform = 'ALL').
//
// ts-node CommonJS, bare relative imports, no extensions, no '@' aliases.
//
// Oracle-type note: the task lists 6 oracle types (API, UI_WEB, UI_MOBILE, VISUAL_WEB,
// VISUAL_MOBILE, PERFORMANCE), but feature tags cannot distinguish visual-web from
// visual-mobile (a scenario can be `@visual @desktop @android` at once). Composition
// signatures therefore use a 5-dimension model with a single VISUAL dimension, applied
// consistently to oracle_count and composition signatures. See report lib-gap note.
import { join } from 'path';
import { existsSync, readFileSync } from 'fs';
import { writeQualityCsv, QualityRecord, safeMain, NA } from './lib/quality';
import { P, walk, relPosix } from './lib/paths';
import { readCsv } from './lib/csv';
import { listFiles } from './lib/discover';
import { readJsonl } from './lib/jsonl';

const CATEGORY = 'Interoperability';

// 5-dimension oracle model derivable from feature tags.
type OracleDim = 'API' | 'UI_WEB' | 'UI_MOBILE' | 'VISUAL' | 'PERFORMANCE';

/** Extract oracle dimensions implied by a scenario's tag set. */
function dimsFromTags(tags: Set<string>): OracleDim[] {
  const dims: OracleDim[] = [];
  if (tags.has('@api')) dims.push('API');
  if (tags.has('@desktop') || tags.has('@responsive')) dims.push('UI_WEB');
  if (tags.has('@android') || tags.has('@ios')) dims.push('UI_MOBILE');
  if (tags.has('@visual')) dims.push('VISUAL');
  if (tags.has('@performance')) dims.push('PERFORMANCE');
  return dims;
}

/**
 * Parse feature files for scenario-level tag sets (Feature-level tags inherited).
 * Returns one Set<string> of tags per scenario.
 */
function scenarioTagSets(): Set<string>[] {
  const out: Set<string>[] = [];
  for (const file of walk(P.features, '.feature')) {
    let featureTags = new Set<string>();
    let pendingTags = new Set<string>();
    let sawFeature = false;
    for (const raw of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const line = raw.trim();
      if (line === '') continue;
      if (line.startsWith('@')) {
        const tags = line.split(/\s+/).filter((t) => t.startsWith('@'));
        for (const t of tags) pendingTags.add(t.toLowerCase());
        continue;
      }
      if (/^Feature:/i.test(line)) {
        featureTags = new Set(pendingTags);
        pendingTags = new Set();
        sawFeature = true;
        continue;
      }
      if (/^(Scenario|Scenario Outline):/i.test(line)) {
        const merged = new Set<string>(sawFeature ? featureTags : []);
        for (const t of pendingTags) merged.add(t);
        out.push(merged);
        pendingTags = new Set();
        continue;
      }
      // Any other keyword line (Background, Given/When/Then, Examples, etc.):
      // tags only ever attach to Feature/Scenario, so drop pending on non-tag content
      // that is not a Feature/Scenario header to avoid leaking to wrong block.
      if (/^(Background|Examples|Rule):/i.test(line)) {
        pendingTags = new Set();
      }
    }
  }
  return out;
}

function main(): void {
  const records: QualityRecord[] = [];

  // --- Evidence sources ---
  const outcomePath = join(P.processed, 'scenario_outcome_history.csv');
  const outcomes = readCsv(outcomePath);
  const haveExecution = outcomes.length > 0;
  const outcomeOf = (r: Record<string, string>): string =>
    (r.outcome || r.status || '').toUpperCase();

  const apiPath = join(P.processed, 'api_isolated_results.csv');
  const visualPath = join(P.processed, 'visual_comparison_results.csv');
  const perfPath = join(P.processed, 'performance_summary.csv');
  const apiRows = readCsv(apiPath);
  const visualRows = readCsv(visualPath);
  const perfRows = readCsv(perfPath);

  // tool-events presence for UI oracle (web or mobile)
  const toolEvents = listFiles(P.rawToolEvents, '.jsonl').flatMap((f) =>
    readJsonl(f),
  ) as Array<Record<string, unknown>>;

  // --- tool_count: distinct tools executed from outcome history; NA if none ---
  let toolCount: string | number = NA;
  if (haveExecution) {
    const tools = new Set<string>();
    for (const r of outcomes) {
      const t = r.tool_name;
      if (t && t.trim() !== '' && t !== 'UNKNOWN') tools.add(t);
    }
    toolCount = tools.size;
  }
  records.push({
    metric_category: CATEGORY,
    metric_name: 'tool_count',
    metric_value: toolCount,
    metric_unit: 'count',
    source_file: haveExecution ? relPosix(outcomePath) : `${relPosix(outcomePath)} (no execution)`,
  });

  // --- Oracle availability booleans ---
  const apiAvailable = apiRows.length > 0 ? 1 : 0;
  const isWebOrMobile = (e: Record<string, unknown>): boolean => {
    const blob = `${e.platform ?? ''} ${e.tool_name ?? ''} ${e.tool ?? ''}`.toLowerCase();
    return /(web|desktop|responsive|playwright|mobile|android|ios|appium)/.test(blob);
  };
  const uiFromEvents = toolEvents.some(isWebOrMobile);
  const uiFromOutcomes =
    haveExecution &&
    outcomes.some((r) =>
      /(web|desktop|responsive|playwright|mobile|android|ios|appium)/.test(
        `${r.platform ?? ''} ${r.tool_name ?? ''}`.toLowerCase(),
      ),
    );
  const uiAvailable = uiFromEvents || uiFromOutcomes ? 1 : 0;
  const visualAvailable = visualRows.length > 0 ? 1 : 0;
  const perfAvailable = perfRows.length > 0 ? 1 : 0;

  records.push({
    metric_category: CATEGORY,
    metric_name: 'api_oracle_available',
    metric_value: apiAvailable,
    metric_unit: 'boolean',
    source_file: existsSync(apiPath) ? relPosix(apiPath) : `${relPosix(apiPath)} (missing)`,
  });
  records.push({
    metric_category: CATEGORY,
    metric_name: 'ui_oracle_available',
    metric_value: uiAvailable,
    metric_unit: 'boolean',
    source_file: `${relPosix(P.rawToolEvents)}; ${relPosix(outcomePath)}`,
  });
  records.push({
    metric_category: CATEGORY,
    metric_name: 'visual_oracle_available',
    metric_value: visualAvailable,
    metric_unit: 'boolean',
    source_file: existsSync(visualPath)
      ? relPosix(visualPath)
      : `${relPosix(visualPath)} (missing)`,
  });
  records.push({
    metric_category: CATEGORY,
    metric_name: 'performance_oracle_available',
    metric_value: perfAvailable,
    metric_unit: 'boolean',
    source_file: existsSync(perfPath) ? relPosix(perfPath) : `${relPosix(perfPath)} (missing)`,
  });

  // --- oracle_count: number of oracle dimensions with evidence ---
  // Map availability to the 5-dim model: VISUAL via visual results; UI(_WEB/_MOBILE) via UI oracle.
  const availableDims = new Set<OracleDim>();
  if (apiAvailable) availableDims.add('API');
  if (visualAvailable) availableDims.add('VISUAL');
  if (perfAvailable) availableDims.add('PERFORMANCE');
  if (uiAvailable) {
    // Distinguish web/mobile from execution platforms when possible.
    const platBlob = outcomes
      .map((r) => `${r.platform ?? ''} ${r.tool_name ?? ''}`.toLowerCase())
      .concat(toolEvents.map((e) => `${e.platform ?? ''} ${e.tool_name ?? ''}`.toLowerCase()))
      .join(' ');
    if (/(web|desktop|responsive|playwright)/.test(platBlob)) availableDims.add('UI_WEB');
    if (/(mobile|android|ios|appium)/.test(platBlob)) availableDims.add('UI_MOBILE');
    if (availableDims.size === 0 || (!/(web|desktop|responsive|playwright|mobile|android|ios|appium)/.test(platBlob)))
      availableDims.add('UI_WEB');
  }
  records.push({
    metric_category: CATEGORY,
    metric_name: 'oracle_count',
    metric_value: availableDims.size,
    metric_unit: 'count',
    source_file: 'metrics/processed/{api_isolated_results,visual_comparison_results,performance_summary}.csv; tool-events',
  });

  // --- oracle_composition_count: distinct multi-oracle composition signatures from tags ---
  const tagSets = scenarioTagSets();
  const compositionSignatures = new Set<string>();
  const allCompositions: OracleDim[][] = [];
  for (const tags of tagSets) {
    const dims = dimsFromTags(tags);
    if (dims.length >= 2) {
      const sig = [...new Set(dims)].sort().join('+');
      compositionSignatures.add(sig);
      allCompositions.push([...new Set(dims)]);
    }
  }
  records.push({
    metric_category: CATEGORY,
    metric_name: 'oracle_composition_count',
    metric_value: compositionSignatures.size,
    metric_unit: 'count',
    source_file: relPosix(P.features) + ' (*.feature tags)',
  });

  // --- successful_oracle_composition_count: compositions whose oracles all have evidence; NA if no execution ---
  let successfulCompositions: string | number = NA;
  if (haveExecution || apiAvailable || visualAvailable || perfAvailable || uiAvailable) {
    const dimHasEvidence = (d: OracleDim): boolean => {
      switch (d) {
        case 'API':
          return apiAvailable === 1;
        case 'VISUAL':
          return visualAvailable === 1;
        case 'PERFORMANCE':
          return perfAvailable === 1;
        case 'UI_WEB':
        case 'UI_MOBILE':
          return uiAvailable === 1;
      }
    };
    const successSigs = new Set<string>();
    for (const dims of allCompositions) {
      if (dims.every(dimHasEvidence)) {
        successSigs.add([...new Set(dims)].sort().join('+'));
      }
    }
    successfulCompositions = successSigs.size;
  }
  records.push({
    metric_category: CATEGORY,
    metric_name: 'successful_oracle_composition_count',
    metric_value: successfulCompositions,
    metric_unit: 'count',
    source_file:
      haveExecution || apiAvailable || visualAvailable || perfAvailable || uiAvailable
        ? `${relPosix(P.features)} + evidence CSVs`
        : `${relPosix(P.features)} (no execution evidence)`,
  });

  writeQualityCsv(join(P.processed, 'interoperability_metrics.csv'), records);
  console.log(`[measure-interoperability] wrote ${records.length} metrics`);
}

safeMain('measure-interoperability', main);
