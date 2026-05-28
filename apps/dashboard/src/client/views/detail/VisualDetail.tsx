import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import type { Tool, VisualDiff } from '@shared/types';
import { DetailHead } from '../../components/DetailHead';
import { DiffTriplet } from '../../components/DiffTriplet';
import { KpiStrip } from '../../components/KpiStrip';

interface VisualDetailProps {
  runId: string;
  tool: Tool;
}

type VisualFilter = 'all' | 'passed' | 'failed';

/** 'desktop' → 'Desktop', 'responsive' → 'Responsive', else Title-cased as-is. */
function prettyViewport(viewport: string): string {
  if (viewport === 'desktop') return 'Desktop';
  if (viewport === 'responsive') return 'Responsive';
  return viewport.charAt(0).toUpperCase() + viewport.slice(1);
}

/** PixelMatch visual-regression detail view. Ported 1:1 from the prototype. */
export function VisualDetail({ runId, tool }: VisualDetailProps) {
  if (tool.kind !== 'visual') {
    return (
      <div className="state">
        <div className="title">VisualDetail received an unexpected tool kind</div>
        <div>
          <code>{tool.kind}</code>
        </div>
      </div>
    );
  }

  const diffs = tool.diffs;

  // Group by bucketing.viewport. Diffs without viewport info collapse into a
  // single implicit group (no outer tab strip → backward compatible).
  const viewportGroups = useMemo(() => {
    const map = new Map<string, VisualDiff[]>();
    for (const d of diffs) {
      const vp = d.bucketing?.viewport;
      if (!vp) continue;
      const arr = map.get(vp) ?? [];
      arr.push(d);
      map.set(vp, arr);
    }
    return map;
  }, [diffs]);

  const viewportKeys = useMemo(() => Array.from(viewportGroups.keys()), [viewportGroups]);
  const hasViewports = viewportKeys.length > 0;

  const [activeViewport, setActiveViewport] = useState<string>(() => viewportKeys[0] ?? '');

  // The diffs in scope for KPIs / filter / list: the active viewport's diffs
  // when bucketed, else the full set.
  const scopedDiffs = hasViewports ? viewportGroups.get(activeViewport) ?? [] : diffs;

  return (
    <div className="detail fade-in">
      <DetailHead
        runId={runId}
        tool={tool}
        right={
          <>
            <span className="pill" style={{ fontFamily: 'var(--mono)', fontSize: 11.5 }}>
              ⏱ {tool.duration}
            </span>
            <button type="button" className="btn ghost">Approve all changes</button>
          </>
        }
      />

      {hasViewports && (
        <div className="panel" style={{ paddingBottom: 14 }}>
          <div className="platform-tabs">
            {viewportKeys.map((vp) => {
              const count = viewportGroups.get(vp)?.length ?? 0;
              return (
                <button
                  key={vp}
                  type="button"
                  className={vp === activeViewport ? 'active' : ''}
                  onClick={() => setActiveViewport(vp)}
                >
                  <span aria-hidden>{vp === 'responsive' ? '📱' : '🖥'}</span> {prettyViewport(vp)}
                  <span
                    style={{
                      fontFamily: 'var(--mono)',
                      fontSize: 11,
                      color: 'var(--text-mute)',
                      marginLeft: 4,
                    }}
                  >
                    {count} screens
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <VisualViewportPanel key={activeViewport} diffs={scopedDiffs} toolMissing={tool.missing} />
    </div>
  );
}

/**
 * KPI strip + All/Matched/Mismatched filter + diff list for one viewport's
 * diffs (or the full set when not bucketed). Re-mounted per viewport via `key`
 * so the filter resets when switching viewports.
 */
function VisualViewportPanel({
  diffs,
  toolMissing,
}: {
  diffs: VisualDiff[];
  toolMissing?: boolean;
}) {
  const [filter, setFilter] = useState<VisualFilter>('all');

  const filtered = useMemo(
    () => diffs.filter((d) => filter === 'all' || d.status === filter),
    [diffs, filter],
  );

  const counts = useMemo(
    () => ({
      all: diffs.length,
      passed: diffs.filter((d) => d.status === 'passed').length,
      failed: diffs.filter((d) => d.status === 'failed').length,
    }),
    [diffs],
  );

  const avgDiff = useMemo(() => {
    if (diffs.length === 0) return '0.00%';
    const sum = diffs.reduce((acc, d) => acc + d.diffPct, 0);
    return (sum / diffs.length).toFixed(2) + '%';
  }, [diffs]);

  return (
    <>
      <KpiStrip
        items={[
          { label: 'Screens compared', value: diffs.length },
          { label: 'Matched',          value: counts.passed, tone: 'pass' },
          { label: 'Mismatched',       value: counts.failed, tone: 'fail' },
          { label: 'Avg diff',         value: avgDiff },
          { label: 'Threshold',        value: '0.10%', sub: 'configured tolerance' },
        ]}
      />

      <div className="panel" style={{ paddingBottom: 14 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 14,
          }}
        >
          <h3 style={{ margin: 0 }}>Visual diffs</h3>
          {diffs.length > 0 && (
            <div className="filter-tabs">
              <button
                type="button"
                className={filter === 'all' ? 'active' : ''}
                onClick={() => setFilter('all')}
              >
                All <b style={{ opacity: 0.6 }}>{counts.all}</b>
              </button>
              <button
                type="button"
                className={filter === 'passed' ? 'active' : ''}
                onClick={() => setFilter('passed')}
              >
                Matched <b style={{ opacity: 0.6 }}>{counts.passed}</b>
              </button>
              <button
                type="button"
                className={filter === 'failed' ? 'active' : ''}
                onClick={() => setFilter('failed')}
              >
                Mismatched <b style={{ opacity: 0.6 }}>{counts.failed}</b>
              </button>
            </div>
          )}
        </div>
        {(toolMissing || diffs.length === 0) && (
          <div className="empty">No data generated for this tool in this run.</div>
        )}
      </div>

      {diffs.length > 0 && (
        <div className="diff-list">
          {filtered.map((d) => (
            <div className="diff-row" key={d.baseline}>
              <div className="diff-row-head">
                <div>
                  <div className="name">{d.name}</div>
                  <div className="meta">
                    {d.baseline}.png · {d.status === 'passed' ? 'within tolerance' : 'exceeds threshold'}
                  </div>
                  {d.bucketing && (
                    <div className="chips">
                      {d.bucketing.market    && <span className="chip chip-market">{d.bucketing.market}</span>}
                      {d.bucketing.language  && <span className="chip chip-language">{d.bucketing.language}</span>}
                      {d.bucketing.viewport  && <span className="chip chip-viewport">{d.bucketing.viewport}</span>}
                      {d.bucketing.platform  && <span className="chip chip-platform">{d.bucketing.platform}</span>}
                    </div>
                  )}
                  {d.triggeredBy && d.triggeredBy.runId && (
                    <div className="triggered-by">
                      <Link to={`/runs/${d.triggeredBy.runId}/playwright?expand=${encodeURIComponent(d.triggeredBy.scenario)}`}>
                        📍 {d.triggeredBy.scenario} in {d.triggeredBy.feature}
                      </Link>
                    </div>
                  )}
                </div>
                <span className={'delta ' + (d.status === 'passed' ? 'ok' : 'bad')}>
                  Δ {d.diffPct.toFixed(2)}%
                </span>
              </div>
              <DiffTriplet images={d.images} />
            </div>
          ))}
        </div>
      )}
    </>
  );
}
