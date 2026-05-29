// Deterministic CSV writer/reader for the metrics pipeline.
// - Always writes a header row, even when there are no data rows.
// - Rows are sorted by their serialized form so output is stable across runs.
// - RFC-4180 quoting for fields containing comma, quote, CR or LF.
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { ensureDir } from './paths';
import { dirname } from 'path';

export function toCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  return String(v);
}

function quote(cell: string): string {
  if (/[",\r\n]/.test(cell)) {
    return `"${cell.replace(/"/g, '""')}"`;
  }
  return cell;
}

export function writeCsv(
  absPath: string,
  columns: string[],
  rows: Array<Record<string, unknown>>,
): void {
  ensureDir(dirname(absPath));
  const header = columns.map(quote).join(',');
  const body = rows
    .map((row) => columns.map((c) => quote(toCell(row[c]))).join(','))
    .sort();
  const content = [header, ...body].join('\n') + '\n';
  writeFileSync(absPath, content, 'utf8');
}

/** Parse a CSV produced by writeCsv (or compatible). Returns [] if missing. */
export function readCsv(absPath: string): Array<Record<string, string>> {
  if (!existsSync(absPath)) return [];
  const text = readFileSync(absPath, 'utf8');
  const rows = parseCsv(text);
  if (rows.length === 0) return [];
  const header = rows[0];
  return rows.slice(1).map((cells) => {
    const obj: Record<string, string> = {};
    header.forEach((h, i) => {
      obj[h] = cells[i] ?? '';
    });
    return obj;
  });
}

/** Minimal RFC-4180 parser supporting quoted fields with embedded commas/quotes/newlines. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      // skip fully-empty trailing line
      if (!(row.length === 1 && row[0] === '')) rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    if (!(row.length === 1 && row[0] === '')) rows.push(row);
  }
  return rows;
}

/** Numeric percentile (nearest-rank) over a sorted-or-unsorted array; returns null when empty. */
export function percentile(values: number[], p: number): number | null {
  const xs = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (xs.length === 0) return null;
  const rank = Math.ceil((p / 100) * xs.length);
  return xs[Math.min(rank, xs.length) - 1];
}

export function mean(values: number[]): number | null {
  const xs = values.filter((v) => Number.isFinite(v));
  if (xs.length === 0) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/** Round to 2 decimals for stable CSV output; passes through null. */
export function round2(v: number | null): number | null {
  if (v === null) return null;
  return Math.round(v * 100) / 100;
}
