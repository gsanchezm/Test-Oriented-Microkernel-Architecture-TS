// Canonical filesystem paths for the TOM metrics pipeline.
// REPO_ROOT is resolved from this file's location (scripts/metrics/lib) up to the repo root.
import { resolve, join } from 'path';
import { existsSync, mkdirSync, readdirSync, statSync } from 'fs';

export const REPO_ROOT = resolve(__dirname, '..', '..', '..');

const m = (...p: string[]) => join(REPO_ROOT, 'metrics', ...p);

export const P = {
  repoRoot: REPO_ROOT,
  metrics: m(),
  schemas: m('schemas'),
  processed: m('processed'),
  summary: m('summary'),
  figures: m('figures'),
  // raw
  rawManifest: m('raw', 'run-manifest'),
  rawApi: m('raw', 'api'),
  rawVisual: m('raw', 'visual'),
  rawGatling: m('raw', 'gatling'),
  rawProxyJsonl: m('raw', 'proxy-jsonl'),
  rawCucumberJsonl: m('raw', 'cucumber-jsonl'),
  rawToolEvents: m('raw', 'tool-events'),
  rawToolIntegration: m('raw', 'tool-integration'),
  // sibling artifact roots
  results: join(REPO_ROOT, 'results'),
  reports: join(REPO_ROOT, 'reports'),
  logs: join(REPO_ROOT, 'logs'),
  features: join(REPO_ROOT, 'src', 'core', 'tests'),
  srcRoot: join(REPO_ROOT, 'src'),
};

/** Ensure a directory exists (mkdir -p). Returns the path. */
export function ensureDir(dir: string): string {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

/** Recursively list files under `dir` matching the optional extension filter (e.g. '.feature'). */
export function walk(dir: string, ext?: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      out.push(...walk(full, ext));
    } else if (!ext || name.endsWith(ext)) {
      out.push(full);
    }
  }
  return out.sort();
}

/** Repo-relative POSIX path for stable, portable source_file columns. */
export function relPosix(absPath: string): string {
  return absPath.slice(REPO_ROOT.length + 1).split('\\').join('/');
}
