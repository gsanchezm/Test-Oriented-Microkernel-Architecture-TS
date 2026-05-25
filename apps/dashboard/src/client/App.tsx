import { useEffect, useState } from 'react';
import { Outlet, useParams } from 'react-router-dom';

import { ApiError, fetchRuns } from './api';
import { Topbar } from './components/Topbar';
import type { ManifestEntry } from '@shared/types';

export function App() {
  const { runId, toolId } = useParams();
  const [runs, setRuns] = useState<ManifestEntry[] | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    fetchRuns(ac.signal)
      .then(setRuns)
      .catch((err) => {
        if (err.name !== 'AbortError') setError(err);
      });
    return () => ac.abort();
  }, []);

  const screenLabel = !runId ? '01 Overview' : toolId ? `02 ${toolId}` : '01 Overview';

  return (
    <div className="shell" data-screen-label={screenLabel} data-current-run={runId ?? ''}>
      <Topbar runs={runs ?? []} currentRunId={runId} />
      {error ? <ApiErrorState error={error} /> : <Outlet />}
    </div>
  );
}

function ApiErrorState({ error }: { error: Error }) {
  const detail = error instanceof ApiError ? `${error.status} · ${error.url}` : error.message;
  return (
    <div className="state">
      <div className="title">Couldn't reach the dashboard server</div>
      <div>{detail}</div>
      <div>
        Start it with <code>pnpm dashboard</code> (or check that <code>:8787</code> is reachable).
      </div>
    </div>
  );
}
