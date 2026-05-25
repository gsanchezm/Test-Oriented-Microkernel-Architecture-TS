import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { ManifestEntry, RunInfo } from '../shared/types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../../..');

export const REPORTS_DIR = path.resolve(
  process.env.REPORTS_DIR ?? path.join(repoRoot, 'reports'),
);

/**
 * Resolve a path inside REPORTS_DIR and assert it does not escape via
 * `..` traversal. Throws if the resolved path falls outside REPORTS_DIR.
 */
export function safeResolve(...segments: string[]): string {
  const resolved = path.resolve(REPORTS_DIR, ...segments);
  const prefix = REPORTS_DIR + path.sep;
  if (resolved !== REPORTS_DIR && !resolved.startsWith(prefix)) {
    throw new ReportsPathError(`Path escapes REPORTS_DIR: ${resolved}`);
  }
  return resolved;
}

export class ReportsPathError extends Error {}
export class RunNotFoundError extends Error {
  constructor(public readonly runId: string) {
    super(`Run not found: ${runId}`);
  }
}
export class ToolReportMissingError extends Error {
  constructor(public readonly file: string) {
    super(`Tool report missing: ${file}`);
  }
}

async function readJson<T>(filePath: string): Promise<T> {
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw) as T;
}

export async function listRuns(): Promise<ManifestEntry[]> {
  const manifestPath = safeResolve('manifest.json');
  try {
    const entries = await readJson<ManifestEntry[]>(manifestPath);
    return [...entries].sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
}

export async function getRunInfo(runId: string): Promise<RunInfo> {
  const runFile = safeResolve(runId, 'run.json');
  try {
    return await readJson<RunInfo>(runFile);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new RunNotFoundError(runId);
    }
    throw err;
  }
}

export async function getRawToolReport(
  runId: string,
  toolId: string,
): Promise<unknown> {
  const filePath = safeResolve(runId, `${toolId}.json`);
  try {
    return await readJson<unknown>(filePath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new ToolReportMissingError(filePath);
    }
    throw err;
  }
}

export async function listToolIds(runId: string): Promise<string[]> {
  const runDir = safeResolve(runId);
  let entries: string[];
  try {
    entries = await fs.readdir(runDir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new RunNotFoundError(runId);
    }
    throw err;
  }
  return entries
    .filter((f) => f.endsWith('.json') && f !== 'run.json')
    .map((f) => f.slice(0, -'.json'.length));
}

export function getRunDir(runId: string): string {
  return safeResolve(runId);
}
