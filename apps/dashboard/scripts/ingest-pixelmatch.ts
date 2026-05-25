/**
 * Walk the most recent visual-results/<runId>/ tree, copy PNGs into the
 * dashboard's run directory, and build a `VisualTool`.
 *
 * Expected on-disk layout (per CLAUDE.md):
 *   visual-results/<sourceRunId>/<feature>/<snapshotId>/<platform>/<viewport>/[<market>/[<language>/]]result.json
 *                                                                         + actual.png + diff.png
 *
 * The baseline PNG lives outside visual-results — its absolute path is in
 * result.json's `baselinePath`. We copy all three into
 * reports/<dashboardRunId>/pixelmatch/<key>-{baseline,actual,diff}.png and
 * point the dashboard's image URLs at them.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { VisualDiff, VisualTool } from '../src/shared/types.js';

interface VisualResultFile {
  feature?: string;
  snapshotId?: string;
  platform?: string;
  viewport?: string;
  status?: string;
  passed?: boolean;
  diffPixels?: number;
  totalPixels?: number;
  diffRatio?: number;
  baselinePath?: string;
  actualPath?: string;
  diffPath?: string;
  errorMessage?: string | null;
}

async function findLatestVisualRunDir(repoRoot: string): Promise<string | null> {
  const root = path.join(repoRoot, 'visual-results');
  let entries: string[];
  try {
    entries = await fs.readdir(root);
  } catch {
    return null;
  }
  const candidates: { dir: string; mtimeMs: number }[] = [];
  for (const name of entries) {
    const full = path.join(root, name);
    try {
      const stat = await fs.stat(full);
      if (stat.isDirectory()) candidates.push({ dir: full, mtimeMs: stat.mtimeMs });
    } catch {
      // ignore
    }
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return candidates[0].dir;
}

async function walkResultJsons(root: string): Promise<string[]> {
  const out: string[] = [];
  async function visit(dir: string): Promise<void> {
    let entries: import('node:fs').Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) await visit(full);
      else if (ent.isFile() && ent.name === 'result.json') out.push(full);
    }
  }
  await visit(root);
  return out;
}

function safeSegment(s: string): string {
  return s.replace(/[^A-Za-z0-9_.-]/g, '_');
}

/**
 * Build a stable, filename-safe key from the result.json's location. The
 * directory layout is the canonical bucketing key (feature/snapshotId/
 * platform/viewport[/market[/language]]), so we join those segments with
 * `__`. The key becomes the prefix for the three PNG filenames the dashboard
 * adapter expects.
 */
function keyForResult(visualRoot: string, resultJsonPath: string): string {
  const rel = path.relative(visualRoot, path.dirname(resultJsonPath));
  return rel.split(/[\\/]/).filter(Boolean).map(safeSegment).join('__') || 'unknown';
}

function nameForResult(visualRoot: string, resultJsonPath: string, data: VisualResultFile): string {
  const rel = path.relative(visualRoot, path.dirname(resultJsonPath));
  const parts = rel.split(/[\\/]/).filter(Boolean);
  const feature = data.feature ?? parts[0] ?? 'visual';
  const snapshot = data.snapshotId ?? parts[1] ?? '';
  const tail = parts.slice(2).join(' / ');
  return tail ? `${feature} — ${snapshot} (${tail})` : `${feature} — ${snapshot}`;
}

async function copyIfExists(src: string | undefined, dest: string): Promise<boolean> {
  if (!src) return false;
  try {
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.copyFile(src, dest);
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw err;
  }
}

export interface IngestPixelmatchOptions {
  /** Repo root for resolving visual-results/ if `visualRunDir` is not set. */
  repoRoot: string;
  /** Override the visual-results subdirectory to ingest. */
  visualRunDir?: string;
  /** Absolute path to the dashboard run's directory (reports/<runId>/). */
  dashboardRunDir: string;
  /** runId used by the dashboard URLs. */
  dashboardRunId: string;
}

export async function ingestPixelmatch(
  opts: IngestPixelmatchOptions,
): Promise<VisualTool | null> {
  const visualRunDir = opts.visualRunDir ?? (await findLatestVisualRunDir(opts.repoRoot));
  if (!visualRunDir) return null;

  const resultPaths = await walkResultJsons(visualRunDir);
  if (resultPaths.length === 0) return null;

  const outPngDir = path.join(opts.dashboardRunDir, 'pixelmatch');
  await fs.mkdir(outPngDir, { recursive: true });

  const diffs: VisualDiff[] = [];
  let passed = 0;
  let failed = 0;

  for (const resultPath of resultPaths) {
    let data: VisualResultFile;
    try {
      data = JSON.parse(await fs.readFile(resultPath, 'utf8')) as VisualResultFile;
    } catch {
      continue;
    }

    const key = keyForResult(visualRunDir, resultPath);
    const dir = path.dirname(resultPath);
    // Fallback to colocated PNGs if absolute paths in JSON are stale.
    const actualSrc = data.actualPath && (await exists(data.actualPath))
      ? data.actualPath
      : path.join(dir, 'actual.png');
    const diffSrc = data.diffPath && (await exists(data.diffPath))
      ? data.diffPath
      : path.join(dir, 'diff.png');

    await copyIfExists(data.baselinePath, path.join(outPngDir, `${key}-baseline.png`));
    await copyIfExists(actualSrc,         path.join(outPngDir, `${key}-actual.png`));
    await copyIfExists(diffSrc,           path.join(outPngDir, `${key}-diff.png`));

    const status: VisualDiff['status'] =
      data.passed === true || (data.status ?? '').toUpperCase() === 'PASS' ? 'passed' : 'failed';
    if (status === 'passed') passed++; else failed++;

    diffs.push({
      name: nameForResult(visualRunDir, resultPath, data),
      baseline: key,
      diffPct: +((data.diffRatio ?? 0) * 100).toFixed(2),
      status,
      images: {
        baseline: `/reports/${encodeURIComponent(opts.dashboardRunId)}/pixelmatch/${key}-baseline.png`,
        actual:   `/reports/${encodeURIComponent(opts.dashboardRunId)}/pixelmatch/${key}-actual.png`,
        diff:     `/reports/${encodeURIComponent(opts.dashboardRunId)}/pixelmatch/${key}-diff.png`,
      },
    });
  }

  // Sort failures first so the user lands on what needs triage.
  diffs.sort((a, b) => {
    if (a.status !== b.status) return a.status === 'failed' ? -1 : 1;
    return b.diffPct - a.diffPct;
  });

  return {
    kind: 'visual',
    id: 'pixelmatch',
    name: 'PixelMatch',
    description: `Visual regression — ${path.basename(visualRunDir)} (${diffs.length} snapshots).`,
    passed,
    failed,
    skipped: 0,
    duration: '—',
    diffs,
  };
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}
