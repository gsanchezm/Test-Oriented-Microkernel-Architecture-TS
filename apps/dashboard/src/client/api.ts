import type {
  ManifestEntry,
  RunPayload,
  Tool,
} from '@shared/types';

async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new ApiError(res.status, text || res.statusText, url);
  }
  return (await res.json()) as T;
}

export class ApiError extends Error {
  constructor(public readonly status: number, message: string, public readonly url: string) {
    super(`${status} ${message} (${url})`);
  }
}

export function fetchRuns(signal?: AbortSignal): Promise<ManifestEntry[]> {
  return fetchJson<ManifestEntry[]>('/api/runs', signal);
}

export function fetchRun(runId: string, signal?: AbortSignal): Promise<RunPayload> {
  return fetchJson<RunPayload>(`/api/runs/${encodeURIComponent(runId)}`, signal);
}

export function fetchTool(
  runId: string,
  toolId: string,
  signal?: AbortSignal,
): Promise<Tool> {
  return fetchJson<Tool>(
    `/api/runs/${encodeURIComponent(runId)}/tools/${encodeURIComponent(toolId)}`,
    signal,
  );
}
