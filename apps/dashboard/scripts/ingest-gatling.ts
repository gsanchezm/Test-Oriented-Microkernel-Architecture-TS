/**
 * Aggregate ALL distinct Gatling simulations under `target/gatling/` into one
 * `PerformanceTool`.
 *
 * Gatling 3.14+ no longer writes a stats.json. The numbers we need live as
 * <td class="value ... col-N">VALUE</td> cells inside two <table>s in each
 * simulation's `index.html`: the head table contains the ROOT (aggregate) row,
 * the body table has one row per request group. We regex-match the rows and
 * pull the 13 column values. The columns are:
 *
 *   col-2  Total          col-3  OK         col-4  KO        col-5  %KO
 *   col-6  Cnt/s          col-7  Min ms     col-8  p50 ms    col-9  p75 ms
 *   col-10 p95 ms         col-11 p99 ms     col-12 Max ms    col-13 Mean ms
 *   col-14 StdDev ms
 *
 * Each `target/gatling/jssimulation-<timestamp>/` is one run of one simulation
 * (checkout-load, catalog-load, login-load, ...). Multiple timestamps for the
 * same simulation may exist; we keep only the most recent of each (dedupe by
 * simulation name, derived from `simulation.log`).
 *
 * Roll-up choices for the run-wide gauges:
 *   - requests / OK / KO : summed across simulations.
 *   - errorRate          : total KO / total requests (request-weighted).
 *   - rps                : summed across simulations (each simulation is its
 *                          own concurrent load profile; the combined offered
 *                          load is their sum).
 *   - avgMs / p95 / p99  : request-weighted average of each simulation's ROOT
 *                          value (we don't have raw samples, so weighting by
 *                          request count is the best blend available).
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

interface SimulationReport {
  /** Logical simulation name, e.g. "checkout-load". */
  simulation: string;
  /** Absolute path to the jssimulation-* dir. */
  dir: string;
  /** mtime of the dir, used for dedupe-by-newest. */
  mtimeMs: number;
  /** ROOT / "All Requests" aggregate row. */
  root: RowValues;
  /** Per-request-group rows. */
  scenarios: RowValues[];
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
 * Pull the simulation name out of `simulation.log`. The Gatling log starts
 * with a small binary header of length-prefixed strings:
 *
 *   <4 bytes> <1-byte len> <version e.g. "3.14.9">
 *   <4 bytes> <1-byte len> <simulation name e.g. "checkout-load">
 *
 * Rather than hard-code byte offsets (which shift between Gatling versions),
 * we scan the first chunk for printable-ASCII runs and take the run that
 * immediately follows the semver version string. Falls back to null so the
 * caller can use the dir basename.
 */
async function readSimulationName(dir: string): Promise<string | null> {
  const logPath = path.join(dir, 'simulation.log');
  let buf: Buffer;
  try {
    buf = await fs.readFile(logPath);
  } catch {
    return null;
  }
  // Decode the leading bytes leniently; non-printable bytes become control
  // chars we then split on. 256 bytes comfortably covers the header.
  const head = buf.subarray(0, 256).toString('latin1');
  // Printable-ASCII runs of length >= 3.
  const runs = head.match(/[\x20-\x7e]{3,}/g) ?? [];
  const versionIdx = runs.findIndex((r) => /^\d+\.\d+(\.\d+)?$/.test(r.trim()));
  if (versionIdx !== -1 && versionIdx + 1 < runs.length) {
    const candidate = runs[versionIdx + 1].trim();
    if (candidate) return candidate;
  }
  // Fallback: first run that looks like a simulation id (has a dash or "load").
  const simLike = runs.map((r) => r.trim()).find((r) => /[a-zA-Z].*-|load|Load/.test(r));
  return simLike ?? null;
}

/**
 * Derive 6 distribution buckets from percentiles. Works for either a single
 * ROOT row (per-simulation) or a synthetic rolled-up ROOT (run-wide). We have
 * p50/p95/p99 and a total request count. This is rough — Gatling no longer
 * exposes raw histogram counts in the HTML — but it gives the panel a shape.
 */
function deriveDistribution(total: number, p50: number, p95: number, p99: number): PerfDistributionBucket[] {
  if (total === 0) return [];

  const bucketEdges = [100, 250, 500, 1000, 3000, Infinity];
  const bucketLabels = ['< 100 ms', '100–250 ms', '250–500 ms', '500 ms–1 s', '1 s–3 s', '> 3 s'];
  const bucketCounts = new Array(bucketEdges.length).fill(0);

  // Spread requests by percentile: rough piecewise distribution.
  // 50% of requests <= p50, 45% between p50..p95, 4% between p95..p99, 1% above p99.
  const portions = [
    { fraction: 0.5, upTo: p50 },
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

async function findGatlingDirs(repoRoot: string): Promise<{ dir: string; mtimeMs: number }[]> {
  const gatlingRoot = path.join(repoRoot, 'target', 'gatling');
  let entries: string[];
  try {
    entries = await fs.readdir(gatlingRoot);
  } catch {
    return [];
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
  simDirs.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return simDirs;
}

async function loadReport(dir: string, mtimeMs: number): Promise<SimulationReport | null> {
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

  const simName = (await readSimulationName(dir)) ?? path.basename(dir).replace(/^jssimulation-/, '');
  return { simulation: simName, dir, mtimeMs, root, scenarios };
}

/**
 * Discover all jssimulation-* dirs, parse each, then dedupe by simulation name
 * keeping the most recent of each.
 */
async function discoverReports(
  repoRoot: string,
  explicitDir?: string,
): Promise<SimulationReport[]> {
  if (explicitDir) {
    let mtimeMs = Date.now();
    try {
      mtimeMs = (await fs.stat(explicitDir)).mtimeMs;
    } catch {
      /* keep default */
    }
    const r = await loadReport(explicitDir, mtimeMs);
    return r ? [r] : [];
  }

  const dirs = await findGatlingDirs(repoRoot); // already newest-first
  const byName = new Map<string, SimulationReport>();
  for (const { dir, mtimeMs } of dirs) {
    const report = await loadReport(dir, mtimeMs);
    if (!report) continue;
    // dirs are newest-first; first occurrence of each name wins.
    if (!byName.has(report.simulation)) {
      byName.set(report.simulation, report);
    }
  }
  // Stable, human-friendly order: by simulation name.
  return [...byName.values()].sort((a, b) => a.simulation.localeCompare(b.simulation));
}

export interface IngestGatlingOptions {
  /** Override the directory we look in. Defaults to scanning target/gatling/jssimulation-*. */
  simulationDir?: string;
  /** Repo root, used when `simulationDir` is not supplied. */
  repoRoot: string;
}

export async function ingestGatling(opts: IngestGatlingOptions): Promise<PerformanceTool | null> {
  const reports = await discoverReports(opts.repoRoot, opts.simulationDir);
  if (reports.length === 0) return null;

  // ---- Per-simulation roll-up accumulators -----------------------------
  let total = 0;
  let ok = 0;
  let ko = 0;
  let rpsSum = 0;
  // Request-weighted latency accumulators.
  let p50w = 0;
  let p95w = 0;
  let p99w = 0;
  let meanw = 0;

  const scenarios: PerfBlock['scenarios'] = [];

  for (const report of reports) {
    const rTotal = report.root.values['col-2'] ?? 0;
    total += rTotal;
    ok += report.root.values['col-3'] ?? 0;
    ko += report.root.values['col-4'] ?? 0;
    rpsSum += report.root.values['col-6'] ?? 0;

    const w = rTotal > 0 ? rTotal : 1;
    p50w += (report.root.values['col-8'] ?? 0) * w;
    p95w += (report.root.values['col-10'] ?? 0) * w;
    p99w += (report.root.values['col-11'] ?? 0) * w;
    meanw += (report.root.values['col-13'] ?? 0) * w;

    for (const s of report.scenarios) {
      scenarios.push({
        name: `${report.simulation} · ${s.label}`,
        rps: s.values['col-6'] ?? 0,
        p95: s.values['col-10'] ?? 0,
        errors: s.values['col-5'] ?? 0,
      });
    }
  }

  const weight = total > 0 ? total : reports.length; // matches the w=1 fallback
  const meanMs = +(meanw / weight).toFixed(1);
  const p50Ms = +(p50w / weight).toFixed(0);
  const p95Ms = +(p95w / weight).toFixed(0);
  const p99Ms = +(p99w / weight).toFixed(0);
  const errorRate = total > 0 ? +((ko / total) * 100).toFixed(2) : 0;
  const rps = +rpsSum.toFixed(1);

  const distribution = deriveDistribution(total, p50Ms, p95Ms, p99Ms);
  const maxRps = Math.max(rps, Math.round(rps * 1.4) || 1); // synthetic ceiling

  const perf: PerfBlock = {
    rps,
    avgMs: meanMs,
    p95Ms,
    p99Ms,
    errorRate,
    requests: total,
    maxRps,
    distribution,
    scenarios,
  };

  // "passed/failed": one per scenario row across all simulations. A scenario
  // is "failed" when its row had >0 KO requests.
  let passed = 0;
  let failed = 0;
  for (const report of reports) {
    for (const s of report.scenarios) {
      if ((s.values['col-4'] ?? 0) === 0) passed++;
      else failed++;
    }
  }

  const simNames = reports.map((r) => r.simulation);
  const description =
    `Aggregated load test across ${reports.length} simulation${reports.length > 1 ? 's' : ''}` +
    ` (${simNames.join(', ')}). Stats parsed from index.html. ${ok}/${total} OK · ${ko} KO.`;

  return {
    kind: 'performance',
    id: 'gatling',
    name: 'Gatling',
    description,
    passed,
    failed,
    skipped: 0,
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
