// Merges the nine per-attribute quality CSVs into one consolidated CSV and three
// summary documents. Reads only what the measure-* scripts produced; missing files
// are skipped (never crashes). Deterministic output.
import { join } from 'path';
import { P, ensureDir } from './lib/paths';
import { readCsv } from './lib/csv';
import { QUALITY_COLUMNS } from './lib/quality';
import { safeMain } from './lib/run';
import { writeFileSync } from 'fs';

// Attribute -> per-attribute CSV filename. Order is the article order.
const ATTRIBUTES: Array<{ category: string; file: string }> = [
  { category: 'Maintainability', file: 'maintainability_metrics.csv' },
  { category: 'Modifiability', file: 'modifiability_metrics.csv' },
  { category: 'Extensibility', file: 'extensibility_metrics.csv' },
  { category: 'Reusability', file: 'reusability_metrics.csv' },
  { category: 'Reliability', file: 'reliability_metrics.csv' },
  { category: 'Performance Efficiency', file: 'performance_efficiency_metrics.csv' },
  { category: 'Observability', file: 'observability_metrics.csv' },
  { category: 'Portability', file: 'portability_metrics.csv' },
  { category: 'Interoperability', file: 'interoperability_metrics.csv' },
];

// Article-ready operational definitions / example metrics / interpretation (spec §15.14, verbatim intent).
const ARTICLE_ROWS: Array<[string, string, string, string]> = [
  [
    'Maintainability',
    'Ability to understand, modify, debug, and maintain the automation architecture.',
    'duplicated LOC, file size, telemetry completeness, failure bucket coverage.',
    'Lower duplication and higher telemetry completeness indicate better maintainability.',
  ],
  [
    'Modifiability',
    'Amount of existing architecture code affected by a change.',
    'core files modified, adapter files modified, LOC modified, change impact score.',
    'Lower change impact indicates better modifiability.',
  ],
  [
    'Extensibility',
    'Ability to add new tools, oracles, or execution capabilities with localized changes.',
    'new tool files added, existing core files changed, integration effort proxy score.',
    'Lower core modification and lower integration impact indicate better extensibility.',
  ],
  [
    'Reusability',
    'Reuse of scenarios, contracts, test data, and steps across tools/platforms.',
    'scenario reuse ratio, contract reuse count, feature-to-tool coverage.',
    'Higher reuse indicates stronger cross-platform architecture.',
  ],
  [
    'Reliability',
    'Stability of repeated automation executions.',
    'pass rate, fail rate, pass-to-fail probability, flaky scenario count.',
    'Higher pass rate and lower pass-to-fail probability indicate better reliability.',
  ],
  [
    'Performance Efficiency',
    'Execution efficiency under equivalent tool and CI conditions.',
    'workflow duration, job duration, p50/p95/p99 scenario duration.',
    'Lower duration under equivalent coverage indicates better performance efficiency.',
  ],
  [
    'Observability',
    'Ability to explain execution behavior and classify failures.',
    'telemetry completeness, classified failure percentage, logs/artifacts uploaded.',
    'Higher telemetry completeness and classified failure coverage indicate better observability.',
  ],
  [
    'Portability',
    'Ability to execute consistently across tools, platforms, and environments.',
    'successful tool count, platform coverage percentage, environment-specific config count.',
    'Higher successful platform coverage indicates better portability.',
  ],
  [
    'Interoperability',
    'Ability to integrate heterogeneous testing tools and composable oracles.',
    'tool count, oracle count, successful oracle composition count.',
    'Higher successful oracle composition indicates better interoperability.',
  ],
];

function mdCell(v: string): string {
  return (v ?? '').toString().replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

main();

function main(): void {
  safeMain('build-quality-attribute-summary', () => {
    const merged: Array<Record<string, string>> = [];
    const byCategory: Record<string, Array<Record<string, string>>> = {};

    for (const { category, file } of ATTRIBUTES) {
      const rows = readCsv(join(P.processed, file));
      byCategory[category] = rows;
      merged.push(...rows);
    }

    // 1) Consolidated CSV (sorted by category, metric_name, tool for determinism).
    ensureDir(P.processed);
    const header = [...QUALITY_COLUMNS].join(',');
    const body = merged
      .map((r) => [...QUALITY_COLUMNS].map((c) => csvCell(r[c] ?? '')).join(','))
      .sort();
    writeFileSync(
      join(P.processed, 'quality_attribute_metrics.csv'),
      [header, ...body].join('\n') + '\n',
      'utf8',
    );

    // 2) quality_attribute_summary.md — one table per attribute.
    ensureDir(P.summary);
    const mdParts: string[] = [
      '# TOM Quality Attribute Summary',
      '',
      'architecture_type = **TOM**. These metrics evaluate the automation architecture, not the OmniPizza application under test.',
      '',
    ];
    for (const { category } of ATTRIBUTES) {
      const rows = byCategory[category] ?? [];
      mdParts.push(`## ${category}`, '');
      mdParts.push('| Quality Attribute | Metric | Value | Unit | Tool | Source |');
      mdParts.push('|---|---:|---:|---|---|---|');
      if (rows.length === 0) {
        mdParts.push(`| ${category} | _(no metrics emitted)_ |  |  |  |  |`);
      } else {
        for (const r of rows) {
          mdParts.push(
            `| ${mdCell(category)} | ${mdCell(r.metric_name)} | ${mdCell(r.metric_value)} | ${mdCell(
              r.metric_unit,
            )} | ${mdCell(r.tool_name)} | ${mdCell(r.source_file)} |`,
          );
        }
      }
      mdParts.push('');
    }
    writeFileSync(join(P.summary, 'quality_attribute_summary.md'), mdParts.join('\n') + '\n', 'utf8');

    // 3) quality_attribute_summary.json — nested by attribute.
    const json: Record<string, unknown> = {
      architecture_type: 'TOM',
      attributes: {} as Record<string, unknown>,
    };
    for (const { category } of ATTRIBUTES) {
      const rows = byCategory[category] ?? [];
      (json.attributes as Record<string, unknown>)[category] = rows.map((r) => ({
        metric_name: r.metric_name,
        metric_value: r.metric_value,
        metric_unit: r.metric_unit,
        tool_name: r.tool_name,
        platform: r.platform,
        source_file: r.source_file,
      }));
    }
    writeFileSync(
      join(P.summary, 'quality_attribute_summary.json'),
      JSON.stringify(json, null, 2) + '\n',
      'utf8',
    );

    // 4) article_quality_attributes.md — the article-ready definition table.
    const artParts: string[] = [
      '# Quality Attributes — Article Table (TOM)',
      '',
      'Operational definitions and interpretation rules for the architecture-quality study.',
      'architecture_type = TOM. The same model applies, unchanged, to the future GTAA_BASELINE repository.',
      '',
      '| Quality Attribute | Operational Definition | Example Metrics | Interpretation |',
      '|---|---|---|---|',
    ];
    for (const [attr, def, ex, interp] of ARTICLE_ROWS) {
      artParts.push(`| ${mdCell(attr)} | ${mdCell(def)} | ${mdCell(ex)} | ${mdCell(interp)} |`);
    }
    artParts.push('');
    writeFileSync(join(P.summary, 'article_quality_attributes.md'), artParts.join('\n') + '\n', 'utf8');

    console.log(
      `[build-quality-attribute-summary] merged ${merged.length} rows; wrote quality_attribute_metrics.csv + 3 summary files`,
    );
  });
}

function csvCell(v: string): string {
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}
