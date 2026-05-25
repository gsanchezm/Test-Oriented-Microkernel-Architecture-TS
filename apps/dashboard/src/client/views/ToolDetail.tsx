import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

import type { Tool } from '@shared/types';
import { ApiError, fetchTool } from '../api';
import { DETAIL_BY_KIND } from '../registry/tool-registry';

type State =
  | { kind: 'loading' }
  | { kind: 'ok'; tool: Tool }
  | { kind: 'error'; error: Error };

export function ToolDetail() {
  const { runId, toolId } = useParams();
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    if (!runId || !toolId) return;
    const ac = new AbortController();
    setState({ kind: 'loading' });
    fetchTool(runId, toolId, ac.signal)
      .then((tool) => setState({ kind: 'ok', tool }))
      .catch((err: Error) => {
        if (err.name === 'AbortError') return;
        setState({ kind: 'error', error: err });
      });
    return () => ac.abort();
  }, [runId, toolId]);

  if (state.kind === 'loading') return <div className="state">Loading tool…</div>;
  if (state.kind === 'error') {
    const detail = state.error instanceof ApiError
      ? `${state.error.status} · ${state.error.url}`
      : state.error.message;
    return (
      <div className="state">
        <div className="title">Couldn't load tool</div>
        <div>{detail}</div>
      </div>
    );
  }

  const { tool } = state;
  const Detail = DETAIL_BY_KIND[tool.kind];
  if (!Detail) {
    return (
      <div className="state">
        <div className="title">No detail view registered for kind <code>{tool.kind}</code></div>
      </div>
    );
  }
  // Note: detail views handle `tool.missing` themselves — they keep their
  // chrome (back button, tabs, KPIs, gauges) and swap only the data area
  // with a "No data generated" banner. Verified visually for all 5 kinds.
  return <Detail runId={runId!} tool={tool} />;
}
