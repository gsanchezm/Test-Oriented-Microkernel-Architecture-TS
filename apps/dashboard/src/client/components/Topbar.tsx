import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

import type { ManifestEntry, RunInfo } from '@shared/types';
import { ApiError, fetchRun } from '../api';
import { RunPicker } from './RunPicker';

interface TopbarProps {
  runs: ManifestEntry[];
  currentRunId: string | undefined;
}

export function Topbar({ runs, currentRunId }: TopbarProps) {
  const { toolId } = useParams();
  const [run, setRun] = useState<RunInfo | null>(null);

  useEffect(() => {
    if (!currentRunId) {
      setRun(null);
      return;
    }
    const ac = new AbortController();
    fetchRun(currentRunId, ac.signal)
      .then(({ run }) => setRun(run))
      .catch((err) => {
        if (err instanceof ApiError || err.name !== 'AbortError') setRun(null);
      });
    return () => ac.abort();
  }, [currentRunId]);

  return (
    <div className="topbar">
      <div className="brand" style={{ gap: 18 }}>
        <div className="brand-mark" />
        <div>
          <div className="brand-name">
            {run?.project ?? 'Test Automation'} <span>· test automation report</span>
          </div>
          <div
            style={{
              fontSize: 11,
              color: 'var(--text-dim)',
              marginTop: 2,
              fontFamily: 'var(--mono)',
            }}
          >
            {run ? `${run.buildId} · ${run.branch} @ ${run.commit}` : '—'}
          </div>
        </div>
        {runs.length > 0 && currentRunId && (
          <RunPicker runs={runs} currentRunId={currentRunId} currentToolId={toolId} />
        )}
      </div>
      <div className="run-meta">
        {run && (
          <>
            <span className="pill"><span className="dot live" /> Live · {run.env}</span>
            <span className="pill">⏱ {run.duration}</span>
            <span className="pill">▶ {run.startedAt}</span>
          </>
        )}
      </div>
    </div>
  );
}
