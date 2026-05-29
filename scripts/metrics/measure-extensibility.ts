// Architecture-quality: Extensibility metrics for the TOM automation architecture.
// Measures the effort to integrate a NEW tool/plugin into the automation architecture.
// Primary evidence: metrics/raw/tool-integration/*.json manifests. Fallback: git diff
// vs METRICS_BASE_REF. If neither is available, every metric is NOT_AVAILABLE.
import { join } from 'path';
import { execSync } from 'child_process';
import { P, walk } from './lib/paths';
import { readJsonFile } from './lib/jsonl';
import { writeQualityCsv, QualityRecord, safeMain, NA } from './lib/quality';

const CATEGORY = 'Extensibility';

interface ToolIntegrationManifest {
  tool_name?: string;
  integration_date?: string;
  files_added?: number;
  files_modified?: number;
  core_files_modified?: number;
  configuration_files_modified?: number;
  contract_files_modified?: number;
  loc_added?: number;
  loc_deleted?: number;
  notes?: string;
}

function isCorePath(p: string): boolean {
  const f = p.split('\\').join('/');
  return (
    f.startsWith('src/kernel/') ||
    f.startsWith('src/proto/') ||
    /^src\/plugins\/[^/]+\/server\.ts$/.test(f) ||
    f === 'src/kernel/start-plugins.ts'
  );
}

safeMain('measure-extensibility', () => {
  const records: QualityRecord[] = [];

  // ---- Primary evidence: tool-integration manifests -----------------------
  const manifestFiles = walk(P.rawToolIntegration, '.json');

  if (manifestFiles.length > 0) {
    let parsed = 0;
    for (const file of manifestFiles) {
      const m = readJsonFile<ToolIntegrationManifest>(file);
      if (!m) continue;
      parsed += 1;
      const toolName = m.tool_name && m.tool_name.trim() !== '' ? m.tool_name : 'UNKNOWN';
      const src = 'metrics/raw/tool-integration/' + file.split(/[\\/]/).pop();
      const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

      const filesAdded = num(m.files_added);
      const filesModified = num(m.files_modified);
      const coreModified = num(m.core_files_modified);
      const configModified = num(m.configuration_files_modified);
      const contractModified = num(m.contract_files_modified);
      const locAdded = num(m.loc_added);
      const score =
        filesModified + filesAdded + coreModified * 3 + configModified + contractModified;

      records.push(
        { metric_category: CATEGORY, metric_name: 'new_tool_files_added', metric_value: filesAdded, metric_unit: 'files', tool_name: toolName, source_file: src },
        { metric_category: CATEGORY, metric_name: 'new_tool_files_modified', metric_value: filesModified, metric_unit: 'files', tool_name: toolName, source_file: src },
        { metric_category: CATEGORY, metric_name: 'new_tool_loc_added', metric_value: locAdded, metric_unit: 'loc', tool_name: toolName, source_file: src },
        { metric_category: CATEGORY, metric_name: 'existing_core_files_changed_for_new_tool', metric_value: coreModified, metric_unit: 'files', tool_name: toolName, source_file: src },
        // Not present in the manifest schema — diff-only heuristics.
        { metric_category: CATEGORY, metric_name: 'new_action_or_adapter_count', metric_value: NA, metric_unit: 'count', tool_name: toolName, source_file: src + ' (not in manifest; requires diff)' },
        { metric_category: CATEGORY, metric_name: 'registration_changes_count', metric_value: NA, metric_unit: 'count', tool_name: toolName, source_file: src + ' (not in manifest; requires diff)' },
        { metric_category: CATEGORY, metric_name: 'integration_effort_proxy_score', metric_value: Math.round(score * 100) / 100, metric_unit: 'score', tool_name: toolName, source_file: src },
      );
    }
    // Only short-circuit if at least one manifest actually parsed; otherwise
    // fall through to the git-diff / NA fallback so we never emit zero rows.
    if (parsed > 0) {
      writeQualityCsv(join(P.processed, 'extensibility_metrics.csv'), records);
      return;
    }
  }

  // ---- Fallback: git diff vs METRICS_BASE_REF -----------------------------
  const baseRef = (process.env.METRICS_BASE_REF ?? '').trim();
  let derived = false;
  let newFilesAdded = 0;
  let newFilesModified = 0;
  let newLocAdded = 0;
  let coreChanged = 0;
  let actionAdapterCount = 0;
  let registrationChanges = 0;

  if (baseRef) {
    try {
      const status = execSync(`git diff --name-status ${baseRef}...HEAD`, {
        cwd: P.repoRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      const numstat = execSync(`git diff --numstat ${baseRef}...HEAD`, {
        cwd: P.repoRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      for (const raw of status.split(/\r?\n/)) {
        const line = raw.trim();
        if (!line) continue;
        const parts = line.split('\t');
        const code = parts[0];
        const path = parts[parts.length - 1];
        const f = path.split('\\').join('/');
        if (code.startsWith('A')) newFilesAdded += 1;
        else if (code.startsWith('M')) newFilesModified += 1;
        if (isCorePath(f)) coreChanged += 1;
        if (/^src\/plugins\/[^/]+\/actions\//.test(f)) actionAdapterCount += 1;
        if (/register.*Actions/.test(f)) registrationChanges += 1;
      }
      for (const raw of numstat.split(/\r?\n/)) {
        const line = raw.trim();
        if (!line) continue;
        const parts = line.split('\t');
        if (parts.length < 3) continue;
        const added = parts[0] === '-' ? 0 : parseInt(parts[0], 10) || 0;
        newLocAdded += added;
      }
      derived = true;
    } catch {
      derived = false;
    }
  }

  if (derived) {
    const src = `git diff ${baseRef}...HEAD`;
    const score = newFilesModified + newFilesAdded + coreChanged * 3;
    records.push(
      { metric_category: CATEGORY, metric_name: 'new_tool_files_added', metric_value: newFilesAdded, metric_unit: 'files', source_file: src },
      { metric_category: CATEGORY, metric_name: 'new_tool_files_modified', metric_value: newFilesModified, metric_unit: 'files', source_file: src },
      { metric_category: CATEGORY, metric_name: 'new_tool_loc_added', metric_value: newLocAdded, metric_unit: 'loc', source_file: src },
      { metric_category: CATEGORY, metric_name: 'existing_core_files_changed_for_new_tool', metric_value: coreChanged, metric_unit: 'files', source_file: src },
      { metric_category: CATEGORY, metric_name: 'new_action_or_adapter_count', metric_value: actionAdapterCount, metric_unit: 'count', source_file: src },
      { metric_category: CATEGORY, metric_name: 'registration_changes_count', metric_value: registrationChanges, metric_unit: 'count', source_file: src },
      { metric_category: CATEGORY, metric_name: 'integration_effort_proxy_score', metric_value: Math.round(score * 100) / 100, metric_unit: 'score', source_file: src },
    );
  } else {
    const note = 'no tool-integration manifests; git diff unavailable (set METRICS_BASE_REF)';
    const na = (metric_name: string, metric_unit: string): QualityRecord => ({
      metric_category: CATEGORY,
      metric_name,
      metric_value: NA,
      metric_unit,
      source_file: note,
    });
    records.push(
      na('new_tool_files_added', 'files'),
      na('new_tool_files_modified', 'files'),
      na('new_tool_loc_added', 'loc'),
      na('existing_core_files_changed_for_new_tool', 'files'),
      na('new_action_or_adapter_count', 'count'),
      na('registration_changes_count', 'count'),
      na('integration_effort_proxy_score', 'score'),
    );
  }

  writeQualityCsv(join(P.processed, 'extensibility_metrics.csv'), records);
});
