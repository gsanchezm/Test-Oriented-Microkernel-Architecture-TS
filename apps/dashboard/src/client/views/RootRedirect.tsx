import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';

import type { ManifestEntry } from '@shared/types';
import { ApiError, fetchRuns } from '../api';
import { EmptyManifest } from './EmptyManifest';

type State =
  | { kind: 'loading' }
  | { kind: 'empty' }
  | { kind: 'redirect'; runId: string }
  | { kind: 'error'; error: Error };

export function RootRedirect() {
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    const ac = new AbortController();
    fetchRuns(ac.signal)
      .then((runs: ManifestEntry[]) => {
        if (runs.length === 0) {
          setState({ kind: 'empty' });
        } else {
          setState({ kind: 'redirect', runId: runs[0].runId });
        }
      })
      .catch((err: Error) => {
        if (err.name === 'AbortError') return;
        setState({ kind: 'error', error: err });
      });
    return () => ac.abort();
  }, []);

  if (state.kind === 'loading') return <div className="state">Loading runs…</div>;
  if (state.kind === 'empty') return <EmptyManifest />;
  if (state.kind === 'error') {
    const detail = state.error instanceof ApiError
      ? `${state.error.status} · ${state.error.url}`
      : state.error.message;
    return (
      <div className="state">
        <div className="title">Couldn't list runs</div>
        <div>{detail}</div>
      </div>
    );
  }
  return <Navigate to={`/runs/${state.runId}`} replace />;
}
