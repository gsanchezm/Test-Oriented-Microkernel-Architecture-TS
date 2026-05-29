// Architecture-quality: Modifiability metrics for the TOM automation architecture.
// Measures the cost of a change to the automation ARCHITECTURE between a base ref and HEAD.
// Requires METRICS_BASE_REF; without it (or if git fails) every metric is NOT_AVAILABLE.
import { join } from 'path';
import { execSync } from 'child_process';
import { P } from './lib/paths';
import { writeQualityCsv, QualityRecord, safeMain, NA } from './lib/quality';

const CATEGORY = 'Modifiability';
const GIT_UNAVAILABLE = 'git diff unavailable (set METRICS_BASE_REF)';

type Layer = 'core' | 'execution' | 'adapter' | 'reporting' | 'configuration' | null;

/** Assign each changed path to exactly ONE layer, by precedence. */
function classifyPath(p: string): Layer {
  const f = p.split('\\').join('/');
  // core: kernel, proto, plugin server entrypoints, start-plugins
  if (
    f.startsWith('src/kernel/') ||
    f.startsWith('src/proto/') ||
    /^src\/plugins\/[^/]+\/server\.ts$/.test(f) ||
    f === 'src/kernel/start-plugins.ts'
  ) {
    return 'core';
  }
  // adapter: plugin actions + action registries (before generic execution)
  if (/^src\/plugins\/[^/]+\/actions\//.test(f) || /register.*Actions/.test(f)) {
    return 'adapter';
  }
  // execution: remaining plugin code (not actions, not server)
  if (f.startsWith('src/plugins/')) {
    return 'execution';
  }
  // reporting (must precede configuration so scripts/metrics/*.json counts as reporting)
  if (
    f.startsWith('scripts/metrics/') ||
    f.startsWith('apps/dashboard/') ||
    f.startsWith('scripts/report/')
  ) {
    return 'reporting';
  }
  // configuration
  if (
    f.endsWith('.json') ||
    f.endsWith('.yml') ||
    f.endsWith('.yaml') ||
    /(^|\/)\.env/.test(f) ||
    /(^|\/)tsconfig[^/]*$/.test(f)
  ) {
    return 'configuration';
  }
  return null;
}

safeMain('measure-modifiability', () => {
  const records: QualityRecord[] = [];
  const baseRef = (process.env.METRICS_BASE_REF ?? '').trim();

  const counts = { core: 0, execution: 0, adapter: 0, reporting: 0, configuration: 0 };
  let locAdded = 0;
  let locDeleted = 0;
  let locModified = 0;
  let available = false;

  if (baseRef) {
    try {
      const numstat = execSync(`git diff --numstat ${baseRef}...HEAD`, {
        cwd: P.repoRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      const names = execSync(`git diff --name-only ${baseRef}...HEAD`, {
        cwd: P.repoRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      for (const raw of numstat.split(/\r?\n/)) {
        const line = raw.trim();
        if (!line) continue;
        const parts = line.split('\t');
        if (parts.length < 3) continue;
        const added = parts[0] === '-' ? 0 : parseInt(parts[0], 10) || 0;
        const deleted = parts[1] === '-' ? 0 : parseInt(parts[1], 10) || 0;
        locAdded += added;
        locDeleted += deleted;
        locModified += Math.min(added, deleted);
      }
      for (const raw of names.split(/\r?\n/)) {
        const line = raw.trim();
        if (!line) continue;
        const layer = classifyPath(line);
        if (layer) counts[layer] += 1;
      }
      available = true;
    } catch {
      available = false;
    }
  }

  if (!available) {
    const na = (metric_name: string, metric_unit: string): QualityRecord => ({
      metric_category: CATEGORY,
      metric_name,
      metric_value: NA,
      metric_unit,
      source_file: GIT_UNAVAILABLE,
    });
    records.push(
      na('core_files_modified', 'files'),
      na('execution_layer_files_modified', 'files'),
      na('adapter_files_modified', 'files'),
      na('reporting_files_modified', 'files'),
      na('configuration_files_modified', 'files'),
      na('loc_added', 'loc'),
      na('loc_deleted', 'loc'),
      na('loc_modified', 'loc'),
      na('change_impact_score', 'score'),
    );
  } else {
    const src = `git diff ${baseRef}...HEAD`;
    const changeImpact =
      counts.core * 3 +
      counts.execution * 2 +
      counts.adapter +
      counts.reporting +
      counts.configuration +
      locModified / 100;
    records.push(
      { metric_category: CATEGORY, metric_name: 'core_files_modified', metric_value: counts.core, metric_unit: 'files', source_file: src },
      { metric_category: CATEGORY, metric_name: 'execution_layer_files_modified', metric_value: counts.execution, metric_unit: 'files', source_file: src },
      { metric_category: CATEGORY, metric_name: 'adapter_files_modified', metric_value: counts.adapter, metric_unit: 'files', source_file: src },
      { metric_category: CATEGORY, metric_name: 'reporting_files_modified', metric_value: counts.reporting, metric_unit: 'files', source_file: src },
      { metric_category: CATEGORY, metric_name: 'configuration_files_modified', metric_value: counts.configuration, metric_unit: 'files', source_file: src },
      { metric_category: CATEGORY, metric_name: 'loc_added', metric_value: locAdded, metric_unit: 'loc', source_file: src },
      { metric_category: CATEGORY, metric_name: 'loc_deleted', metric_value: locDeleted, metric_unit: 'loc', source_file: src },
      { metric_category: CATEGORY, metric_name: 'loc_modified', metric_value: locModified, metric_unit: 'loc', source_file: src },
      { metric_category: CATEGORY, metric_name: 'change_impact_score', metric_value: Math.round(changeImpact * 100) / 100, metric_unit: 'score', source_file: src },
    );
  }

  writeQualityCsv(join(P.processed, 'modifiability_metrics.csv'), records);
});
