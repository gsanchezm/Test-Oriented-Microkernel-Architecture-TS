import { useNavigate } from 'react-router-dom';

import type { ManifestEntry } from '@shared/types';

interface RunPickerProps {
  runs: ManifestEntry[];
  currentRunId: string;
  currentToolId?: string;
}

export function RunPicker({ runs, currentRunId, currentToolId }: RunPickerProps) {
  const navigate = useNavigate();

  return (
    <label className="run-picker">
      <span className="label">Run</span>
      <select
        value={currentRunId}
        onChange={(e) => {
          const nextId = e.target.value;
          const path = currentToolId
            ? `/runs/${nextId}/${currentToolId}`
            : `/runs/${nextId}`;
          navigate(path);
        }}
      >
        {runs.map((r) => (
          <option key={r.runId} value={r.runId}>
            {r.buildId} · {r.branch} · {r.startedAt}
          </option>
        ))}
      </select>
    </label>
  );
}
