// Discover raw inputs by run id across the metrics/raw tree.
import { existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

/** List run ids implied by files `<id><ext>` directly under `dir`. */
export function listRunIds(dir: string, ext: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((n) => n.endsWith(ext) && n !== `.gitkeep`)
    .map((n) => n.slice(0, n.length - ext.length))
    .sort();
}

/** Absolute paths of files matching `<dir>/*<ext>` (skips .gitkeep). */
export function listFiles(dir: string, ext: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((n) => n.endsWith(ext) && n !== '.gitkeep')
    .map((n) => join(dir, n))
    .sort();
}

/** Subdirectory names directly under `dir` (used for metrics/raw/gatling/<runId>/). */
export function listSubdirs(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((n) => {
      try {
        return statSync(join(dir, n)).isDirectory();
      } catch {
        return false;
      }
    })
    .sort();
}
