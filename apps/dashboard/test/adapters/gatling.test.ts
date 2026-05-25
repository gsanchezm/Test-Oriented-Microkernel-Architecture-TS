import { describe, it, expect } from 'vitest';

import { gatlingAdapter } from '../../src/server/normalize/gatling';
import type { PerformanceTool } from '../../src/shared/types';
import { ctx } from './_helpers';

describe('gatlingAdapter', () => {
  const fixture: Omit<PerformanceTool, 'kind'> = {
    id: 'gatling',
    name: 'Gatling',
    description: 'Perf.',
    passed: 10,
    failed: 0,
    skipped: 0,
    duration: '5m',
    perf: {
      rps: 100, avgMs: 50, p95Ms: 200, p99Ms: 400,
      errorRate: 0.1, requests: 5000, maxRps: 200,
      distribution: [{ label: '< 100 ms', pct: 80, count: 4000 }],
      scenarios: [{ name: 'login', rps: 60, p95: 90, errors: 0.05 }],
    },
  };

  it('produces a performance tool with perf block intact', () => {
    const out = gatlingAdapter(fixture, ctx());
    expect(out.kind).toBe('performance');
    expect(out.perf.distribution).toHaveLength(1);
    expect(out.perf.scenarios[0].name).toBe('login');
  });
});
