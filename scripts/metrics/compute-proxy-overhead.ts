// Computes microkernel (chaos-proxy) overhead from proxy stdout logs.
// Source: logs/**/proxy*.log (tolerant JSONL — skips non-JSON log lines) + optional PROXY_LOG.
// Keeps records with numeric proxyOverheadMs, re-emits them to metrics/raw/proxy-jsonl/<runId>.jsonl,
// and aggregates by (tool/platform from manifest, action_id) into proxy_overhead_summary.csv.
// chaos-proxy.ts is NOT edited; proxy records carry no runId so identity comes from resolveRunId()/manifest.
import { existsSync, writeFileSync } from 'fs';
import { join, basename } from 'path';
import { safeMain } from './lib/run';
import { P, walk, relPosix, ensureDir } from './lib/paths';
import { readJsonl } from './lib/jsonl';
import { resolveStableRunId } from './lib/env';
import { loadManifests, indexByRunId, commonColumns, COMMON_COLUMNS } from './lib/manifest';
import { writeCsv, percentile, mean, round2 } from './lib/csv';

const SUMMARY_COLUMNS = [
  ...COMMON_COLUMNS,
  'action_id',
  'count',
  'avg_proxy_overhead_ms',
  'p50_proxy_overhead_ms',
  'p95_proxy_overhead_ms',
  'avg_grpc_latency_ms',
];

interface ProxyRecord {
  actionId: string;
  proxyOverheadMs: number;
  piCalculusLatencyMs: number | null;
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

safeMain('compute-proxy-overhead', () => {
  // Discover proxy logs: full paths whose basename includes 'proxy' and ends '.log'.
  const logFiles = walk(P.logs)
    .filter((f) => {
      const b = basename(f).toLowerCase();
      return b.includes('proxy') && b.endsWith('.log');
    });
  const override = process.env.PROXY_LOG;
  if (override && existsSync(override) && !logFiles.includes(override)) {
    logFiles.push(override);
  }

  const kept: ProxyRecord[] = [];
  for (const file of logFiles) {
    for (const raw of readJsonl(file)) {
      const r = raw as Record<string, unknown>;
      const overhead = num(r.proxyOverheadMs);
      if (overhead === null) continue;
      kept.push({
        actionId: r.actionId === null || r.actionId === undefined ? 'UNKNOWN' : String(r.actionId),
        proxyOverheadMs: overhead,
        piCalculusLatencyMs: num(r.piCalculusLatencyMs),
      });
    }
  }

  // Run identity for this aggregation (records themselves carry no runId).
  // Stable fallback (no wall-clock) so reprocessing identical proxy logs is byte-reproducible.
  const runId = resolveStableRunId('proxy');
  const idx = indexByRunId(loadManifests());
  const cc = commonColumns(runId, idx);

  // Re-emit kept records as JSONL (skip when empty).
  if (kept.length > 0) {
    ensureDir(P.rawProxyJsonl);
    const jsonlOut = join(P.rawProxyJsonl, `${runId}.jsonl`);
    const body = kept.map((k) => JSON.stringify(k)).join('\n') + '\n';
    writeFileSync(jsonlOut, body, 'utf8');
    console.log(`[compute-proxy-overhead] wrote ${relPosix(jsonlOut)} (${kept.length} records)`);
  }

  // Group by action_id (tool/platform are uniform — from manifest/env commonColumns).
  const groups = new Map<string, ProxyRecord[]>();
  for (const k of kept) {
    const arr = groups.get(k.actionId) ?? [];
    arr.push(k);
    groups.set(k.actionId, arr);
  }

  const rows = [...groups.entries()].map(([actionId, recs]) => {
    const overheads = recs.map((r) => r.proxyOverheadMs);
    const grpc = recs.map((r) => r.piCalculusLatencyMs).filter((v): v is number => v !== null);
    return {
      ...cc,
      action_id: actionId,
      count: recs.length,
      avg_proxy_overhead_ms: round2(mean(overheads)) ?? '',
      p50_proxy_overhead_ms: round2(percentile(overheads, 50)) ?? '',
      p95_proxy_overhead_ms: round2(percentile(overheads, 95)) ?? '',
      avg_grpc_latency_ms: round2(mean(grpc)) ?? '',
    };
  });

  ensureDir(P.processed);
  const out = join(P.processed, 'proxy_overhead_summary.csv');
  writeCsv(out, SUMMARY_COLUMNS, rows);
  console.log(`[compute-proxy-overhead] wrote ${relPosix(out)} (${rows.length} action groups)`);
});
