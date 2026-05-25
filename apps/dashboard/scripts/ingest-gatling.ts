/**
 * Parse the most recent Gatling HTML report into a `PerformanceTool`.
 *
 * Gatling 3.14+ no longer writes a stats.json. The numbers we need live as
 * <td class="value ... col-N">VALUE</td> cells inside two <table>s in
 * `index.html`: the head table contains the ROOT (aggregate) row, the body
 * table has one row per request group. We regex-match the rows and pull the
 * 13 column values. The columns are:
 *
 *   col-2  Total          col-3  OK         col-4  KO        col-5  %KO
 *   col-6  Cnt/s          col-7  Min ms     col-8  p50 ms    col-9  p75 ms
 *   col-10 p95 ms         col-11 p99 ms     col-12 Max ms    col-13 Mean ms
 *   col-14 StdDev ms
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';

import type {
  PerfBlock,
  PerfDistributionBucket,
  PerformanceTool,
} from '../src/shared/types.js';

interface RowValues {
  label: string;
  values: Record<string, number>; // 'col-2' .. 'col-14'
}

const NAME_RE = /id="stats-table-([^"]+)"\s+class="ellipsed-name">([^<]+)</;
const CELL_RE = /class="value[^"]*\bcol-(\d+)[^"]*"[^>]*>([^<]+)</g;
const TR_RE = /<tr id="([^"]+)"[^>]*?(?:\s+data-parent="[^"]+")?\s*>([\s\S]*?)<\/tr>/g;

function parseNumber(s: string): number {
  const n = Number(s.replace(/[,%]/g, '').trim());
  return Number.isFinite(n) ? n : 0;
}

function extractRows(html: string): RowValues[] {
  const rows: RowValues[] = [];
  let m: RegExpExecArray | null;
  TR_RE.lastIndex = 0;
  while ((m = TR_RE.exec(html))) {
    const trBody = m[2];
    // Pull the human label from the ellipsed-name span (falls back to id).
    const nameMatch = NAME_RE.exec(trBody);
    const label = nameMatch ? nameMatch[2].trim() : m[1];
    // Pull every value cell. We only keep col-2..col-14.
    const values: Record<string, number> = {};
    let v: RegExpExecArray | null;
    CELL_RE.lastIndex = 0;
    while ((v = CELL_RE.exec(trBody))) {
      values[`col-${v[1]}`] = parseNumber(v[2]);
    }
    if (Object.keys(values).length > 0) {
      rows.push({ label, values });
    }
  }
  return rows;
}

/**
 * Derive 6 distribution buckets from the percentiles Gatling reports.
 * We have p50/p75/p95/p99/max. Map them to the dashboard's fixed labels.
 * This is rough — Gatling no longer exposes raw histogram counts in the
 * HTML — but it gives the response-time-distribution panel something
 * shaped like a histogram instead of an empty panel.
 */
function deriveDistribution(perScenarioRows: RowValues[], total: number, root: RowValues): PerfDistributionBucket[] {
  if (total === 0) return [];
  const p50 = root.values['col-8'];
  const p95 = root.values['col-10'];
  const p99 = root.values['col-11'];

  const bucketEdges = [100, 250, 500, 1000, 3000, Infinity];
  const bucketLabels = ['< 100 ms', '100–250 ms', '250–500 ms', '500 ms–1 s', '1 s–3 s', '> 3 s'];
  const bucketCounts = new Array(bucketEdges.length).fill(0);

  // Spread requests by percentile: rough piecewise distribution.
  // 50% of requests <= p50, 45% between p50..p95, 4% between p95..p99, 1% above p99.
  void perScenarioRows;
  const portions = [
    { fraction: 0.5,  upTo: p50 },
    { fraction: 0.45, upTo: p95 },
    { fraction: 0.04, upTo: p99 },
    { fraction: 0.01, upTo: Math.max(p99, p99 + 1) },
  ];
  for (const p of portions) {
    const count = Math.round(p.fraction * total);
    for (let i = 0; i < bucketEdges.length; i++) {
      if (p.upTo <= bucketEdges[i]) {
        bucketCounts[i] += count;
        break;
      }
    }
  }
  return bucketLabels.map((label, i) => ({
    label,
    pct: total === 0 ? 0 : +((bucketCounts[i] / total) * 100).toFixed(1),
    count: bucketCounts[i],
  }));
}

async function findLatestGatlingDir(repoRoot: string): Promise<string | null> {
  const gatlingRoot = path.join(repoRoot, 'target', 'gatling');
  let entries: string[];
  try {
    entries = await fs.readdir(gatlingRoot);
  } catch {
    return null;
  }
  const simDirs: { dir: string; mtimeMs: number }[] = [];
  for (const name of entries) {
    if (!name.startsWith('jssimulation-')) continue;
    const full = path.join(gatlingRoot, name);
    try {
      const stat = await fs.stat(full);
      if (stat.isDirectory()) simDirs.push({ dir: full, mtimeMs: stat.mtimeMs });
    } catch {
      // ignore
    }
  }
  if (simDirs.length === 0) return null;
  simDirs.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return simDirs[0].dir;
}

export interface IngestGatlingOptions {
  /** Override the directory we look in. Defaults to latest target/gatling/jssimulation-*. */
  simulationDir?: string;
  /** Repo root, used when `simulationDir` is not supplied. */
  repoRoot: string;
}

export async function ingestGatling(opts: IngestGatlingOptions): Promise<PerformanceTool | null> {
  const dir = opts.simulationDir ?? (await findLatestGatlingDir(opts.repoRoot));
  if (!dir) return null;

  const htmlPath = path.join(dir, 'index.html');
  let html: string;
  try {
    html = await fs.readFile(htmlPath, 'utf8');
  } catch {
    return null;
  }

  const rows = extractRows(html);
  const root = rows.find((r) => r.label === 'All Requests' || /\bROOT\b/i.test(r.label));
  if (!root) return null;

  const scenarios = rows.filter((r) => r !== root);

  const total      = root.values['col-2'] ?? 0;
  const ok         = root.values['col-3'] ?? 0;
  const ko         = root.values['col-4'] ?? 0;
  const errorRate  = root.values['col-5'] ?? 0;
  const rps        = root.values['col-6'] ?? 0;
  const p95Ms      = root.values['col-10'] ?? 0;
  const p99Ms      = root.values['col-11'] ?? 0;
  const meanMs     = root.values['col-13'] ?? 0;

  const distribution = deriveDistribution(scenarios, total, root);
  const maxRps = Math.max(rps, Math.round(rps * 1.4) || 1); // synthetic ceiling

  const perf: PerfBlock = {
    rps, avgMs: meanMs, p95Ms, p99Ms,
    errorRate, requests: total, maxRps,
    distribution,
    scenarios: scenarios.map((s) => ({
      name: s.label,
      rps: s.values['col-6'] ?? 0,
      p95: s.values['col-10'] ?? 0,
      errors: s.values['col-5'] ?? 0,
    })),
  };

  // "passed/failed" doesn't quite map to Gatling — count of assertions could
  // go here if you publish them. For now: 1 "scenario" per scenario row, all
  // counted as passed unless the row had >0 KO requests.
  const passed = scenarios.filter((s) => (s.values['col-4'] ?? 0) === 0).length;
  const failed = scenarios.length - passed;

  return {
    kind: 'performance',
    id: 'gatling',
    name: 'Gatling',
    description: `Sustained load test (${path.basename(dir)}). Stats parsed from index.html. ${ok}/${total} OK · ${ko} KO.`,
    passed, failed, skipped: 0,
    duration: durationFromRps(total, rps),
    perf,
  };
}

function durationFromRps(total: number, rps: number): string {
  if (rps <= 0) return '—';
  const seconds = Math.round(total / rps);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, '0')}s`;
}
