import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

import type { RunPayload } from '@shared/types';
import { ApiError, fetchRun } from '../api';
import { HeroStrip } from '../components/HeroStrip';
import { ToolCard } from '../components/ToolCard';

type State =
  | { kind: 'loading' }
  | { kind: 'ok'; payload: RunPayload }
  | { kind: 'error'; error: Error };

export function Overview() {
  const { runId } = useParams();
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    if (!runId) return;
    const ac = new AbortController();
    setState({ kind: 'loading' });
    fetchRun(runId, ac.signal)
      .then((payload) => setState({ kind: 'ok', payload }))
      .catch((err: Error) => {
        if (err.name === 'AbortError') return;
        setState({ kind: 'error', error: err });
      });
    return () => ac.abort();
  }, [runId]);

  if (state.kind === 'loading') return <div className="state">Loading run…</div>;
  if (state.kind === 'error') {
    const detail = state.error instanceof ApiError
      ? `${state.error.status} · ${state.error.url}`
      : state.error.message;
    return (
      <div className="state">
        <div className="title">Couldn't load run</div>
        <div>{detail}</div>
      </div>
    );
  }

  const { tools } = state.payload;
  return (
    <div className="fade-in">
      <HeroStrip tools={tools} />
      <div className="section-head">
        <h2>
          Tools <small>{tools.length} testing tools · click a card to drill in</small>
        </h2>
        <div className="legend">
          <span>
            <i style={{ background: 'var(--pass)' }} />Passed
          </span>
          <span>
            <i style={{ background: 'var(--fail)' }} />Failed
          </span>
          <span>
            <i style={{ background: 'var(--skip)' }} />Skipped
          </span>
        </div>
      </div>
      <div className="tool-grid">
        {tools.map((t) => (
          <ToolCard key={t.id} runId={runId!} tool={t} />
        ))}
      </div>
    </div>
  );
}
