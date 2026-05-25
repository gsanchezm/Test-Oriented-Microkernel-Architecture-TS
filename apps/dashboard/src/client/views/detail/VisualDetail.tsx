import { useMemo, useState } from 'react';

import type { Tool } from '@shared/types';
import { DetailHead } from '../../components/DetailHead';
import { DiffTriplet } from '../../components/DiffTriplet';
import { KpiStrip } from '../../components/KpiStrip';

interface VisualDetailProps {
  runId: string;
  tool: Tool;
}

type VisualFilter = 'all' | 'passed' | 'failed';

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

  const [filter, setFilter] = useState<VisualFilter>('all');

  const diffs = tool.diffs;

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
        {(tool.missing || diffs.length === 0) && (
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
    </div>
  );
}
