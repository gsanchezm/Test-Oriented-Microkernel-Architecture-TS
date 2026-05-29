// Tolerant JSONL reading. Skips blank lines and lines that fail to parse
// (e.g. interleaved logger output in a proxy stdout log).
import { existsSync, readFileSync } from 'fs';

export function readJsonl(file: string): unknown[] {
  if (!existsSync(file)) return [];
  const out: unknown[] = [];
  for (const raw of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    try {
      out.push(JSON.parse(line));
    } catch {
      // not JSON — ignore (robust against mixed log streams)
    }
  }
  return out;
}

export function readAllJsonl(files: string[]): unknown[] {
  const out: unknown[] = [];
  for (const f of files) out.push(...readJsonl(f));
  return out;
}

/** Reads a single JSON object file, returning null on missing/parse error. */
export function readJsonFile<T = unknown>(file: string): T | null {
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as T;
  } catch {
    return null;
  }
}
