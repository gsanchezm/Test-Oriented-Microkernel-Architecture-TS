import { describe, it, expect } from 'vitest';

import { buildPerfScenarios, type SimulationReport } from '../../scripts/ingest-gatling';

const sim = (name: string, root: Record<string, number>, requests: Record<string, Record<string, number>>): SimulationReport => ({
  simulation: name,
  dir: `/tmp/${name}`,
  mtimeMs: 0,
  root: { label: 'ROOT', values: root },
  scenarios: Object.entries(requests).map(([label, values]) => ({ label, values })),
});

describe('buildPerfScenarios', () => {
  it('produces one PerfScenario per simulation with simulation-level metrics from ROOT', () => {
    const reports = [
      sim('checkout-load',
          { 'col-6': 120, 'col-10': 350, 'col-5': 0.5 },
          {
            home:      { 'col-6': 40, 'col-10': 200, 'col-5': 0   },
            addToCart: { 'col-6': 80, 'col-10': 450, 'col-5': 1.0 },
          }),
    ];
    const out = buildPerfScenarios(reports);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      name: 'checkout-load',
      rps: 120,
      p95: 350,
      errors: 0.5,
    });
    expect(out[0].steps).toHaveLength(2);
    expect(out[0].steps?.[1]).toMatchObject({ name: 'addToCart', rps: 80, p95: 450, errors: 1.0 });
  });

  it('omits steps[] when a simulation has no per-request rows', () => {
    const reports = [sim('login-load', { 'col-6': 10, 'col-10': 50, 'col-5': 0 }, {})];
    const out = buildPerfScenarios(reports);
    expect(out[0].steps).toBeUndefined();
  });
});
