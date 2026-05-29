// Architecture-quality: Maintainability metrics for the TOM automation architecture.
// Evaluates the automation ARCHITECTURE (src/**), not the OmniPizza application.
// Each metric degrades to NOT_AVAILABLE rather than aborting the file.
import { join } from 'path';
import { execSync } from 'child_process';
import { P, walk } from './lib/paths';
import { readCsv } from './lib/csv';
import { readAllJsonl } from './lib/jsonl';
import { writeQualityCsv, QualityRecord, safeMain, NA } from './lib/quality';

const CATEGORY = 'Maintainability';

/** Non-empty lines of a file (the LOC definition used across these metrics). */
function nonEmptyLines(text: string): string[] {
  return text.split(/\r?\n/).filter((l) => l.trim().length > 0);
}

safeMain('measure-maintainability', () => {
  const records: QualityRecord[] = [];

  // ---- Source walk: file sizes + duplication ------------------------------
  let avgFileSize: number | string = NA;
  let maxFileSize: number | string = NA;
  let duplicatedLoc: number | string = NA;
  let duplicatedPct: number | string = NA;
  try {
    const fs = require('fs') as typeof import('fs');
    const files = walk(P.srcRoot, '.ts');
    const sizes: number[] = [];
    const lineCounts = new Map<string, number>();
    let totalLoc = 0;
    for (const f of files) {
      let text: string;
      try {
        text = fs.readFileSync(f, 'utf8');
      } catch {
        continue;
      }
      const lines = nonEmptyLines(text);
      sizes.push(lines.length);
      totalLoc += lines.length;
      for (const l of lines) {
        const norm = l.trim();
        if (norm.length >= 40) {
          lineCounts.set(norm, (lineCounts.get(norm) ?? 0) + 1);
        }
      }
    }
    if (sizes.length > 0) {
      avgFileSize = Math.round((sizes.reduce((a, b) => a + b, 0) / sizes.length) * 100) / 100;
      maxFileSize = Math.max(...sizes);
      let dup = 0;
      for (const count of lineCounts.values()) {
        if (count > 1) dup += count - 1;
      }
      duplicatedLoc = dup;
      duplicatedPct = totalLoc > 0 ? Math.round((dup / totalLoc) * 10000) / 100 : 0;
    }
  } catch {
    // leave NA
  }

  // ---- files_touched_per_change (git) -------------------------------------
  let filesTouchedPerChange: number | string = NA;
  let filesTouchedSource = 'git log';
  try {
    const out = execSync('git log --pretty=format:%H --name-only -n 100', {
      cwd: P.repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    // Blocks separated by the commit hash line; count file lines per commit.
    let commits = 0;
    let touched = 0;
    for (const raw of out.split(/\r?\n/)) {
      const line = raw.trim();
      if (line === '') continue;
      if (/^[0-9a-f]{40}$/i.test(line)) {
        commits += 1;
      } else {
        touched += 1;
      }
    }
    if (commits > 0) {
      filesTouchedPerChange = Math.round((touched / commits) * 100) / 100;
    }
  } catch {
    filesTouchedSource = 'git log (unavailable)';
  }

  // ---- failure_bucket_coverage_percentage (from failure_buckets.csv) ------
  let failureCoverage: number | string = NA;
  const failureBucketsPath = join(P.processed, 'failure_buckets.csv');
  try {
    const rows = readCsv(failureBucketsPath);
    const failing = rows.filter((r) => (r.status ?? '').toUpperCase() === 'FAIL');
    if (failing.length > 0) {
      const classified = failing.filter((r) => (r.failure_bucket ?? '').trim() !== '').length;
      failureCoverage = Math.round((classified / failing.length) * 10000) / 100;
    }
  } catch {
    // leave NA
  }

  // ---- telemetry_completeness_percentage (tool-events jsonl) --------------
  let telemetryCompleteness: number | string = NA;
  try {
    const files = walk(P.rawToolEvents, '.jsonl');
    const events = readAllJsonl(files) as Array<Record<string, unknown>>;
    if (events.length > 0) {
      // logger emits 'outcome'; cucumber-normalized emits 'status' — accept either
      const complete = events.filter(
        (e) =>
          e.scenario !== undefined &&
          e.scenario !== null &&
          ((e.status !== undefined && e.status !== null) ||
            (e.outcome !== undefined && e.outcome !== null)) &&
          e.durationMs !== undefined &&
          e.durationMs !== null,
      ).length;
      telemetryCompleteness = Math.round((complete / events.length) * 10000) / 100;
    }
  } catch {
    // leave NA
  }

  records.push(
    { metric_category: CATEGORY, metric_name: 'duplicated_loc', metric_value: duplicatedLoc, metric_unit: 'loc', source_file: 'src/**/*.ts' },
    { metric_category: CATEGORY, metric_name: 'duplicated_code_percentage', metric_value: duplicatedPct, metric_unit: 'percent', source_file: 'src/**/*.ts' },
    { metric_category: CATEGORY, metric_name: 'files_touched_per_change', metric_value: filesTouchedPerChange, metric_unit: 'files', source_file: filesTouchedSource },
    { metric_category: CATEGORY, metric_name: 'average_file_size_loc', metric_value: avgFileSize, metric_unit: 'loc', source_file: 'src/**/*.ts' },
    { metric_category: CATEGORY, metric_name: 'max_file_size_loc', metric_value: maxFileSize, metric_unit: 'loc', source_file: 'src/**/*.ts' },
    { metric_category: CATEGORY, metric_name: 'cyclomatic_complexity_if_available', metric_value: NA, metric_unit: 'complexity', source_file: 'no AST pass (heuristic unavailable)' },
    { metric_category: CATEGORY, metric_name: 'failure_bucket_coverage_percentage', metric_value: failureCoverage, metric_unit: 'percent', source_file: failureCoverage === NA ? 'metrics/processed/failure_buckets.csv (missing/empty)' : 'metrics/processed/failure_buckets.csv' },
    { metric_category: CATEGORY, metric_name: 'telemetry_completeness_percentage', metric_value: telemetryCompleteness, metric_unit: 'percent', source_file: telemetryCompleteness === NA ? 'metrics/raw/tool-events/*.jsonl (none)' : 'metrics/raw/tool-events/*.jsonl' },
  );

  writeQualityCsv(join(P.processed, 'maintainability_metrics.csv'), records);
});
