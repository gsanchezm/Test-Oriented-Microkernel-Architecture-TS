import type { AdapterContext } from '../../src/server/normalize/index';
import type { RunInfo } from '../../src/shared/types';

export function ctx(overrides: Partial<AdapterContext> = {}): AdapterContext {
  const runInfo: RunInfo = {
    project: 'Test',
    buildId: 'build-1',
    branch: 'main',
    commit: 'abc',
    triggeredBy: 'tester',
    startedAt: '2026-05-24 00:00:00',
    duration: '1m',
    env: 'test',
  };
  return {
    runId: 'run-1',
    runDir: '/tmp/run-1',
    runInfo,
    ...overrides,
  };
}
