import { useState } from 'react';

import type { PerfScenario, Tool } from '@shared/types';

import { DetailHead } from '../../components/DetailHead';
import { Speedometer } from '../../components/Speedometer';

interface PerformanceDetailProps {
  runId: string;
  tool: Tool;
}

export function PerformanceDetail({ runId, tool }: PerformanceDetailProps) {
  if (tool.kind !== 'performance') {
    return (
      <div className="state">
        <div className="title">Performance detail view</div>
        <div>
          Tool <code>{tool.id}</code> is not a performance tool.
        </div>
      </div>
    );
  }

  const p = tool.perf;
  const noData = tool.missing === true || p.requests === 0;
  const maxDist = p.distribution.length
    ? Math.max(...p.distribution.map((d) => d.pct))
    : 1;

  return (
    <div className="detail fade-in">
      <DetailHead
        runId={runId}
        tool={tool}
        right={
          <>
            <span className="pill">⏱ {tool.duration}</span>
            <button className="btn ghost">Download HAR</button>
          </>
        }
      />

      <div className="panel">
        <h3>Performance gauges</h3>
        {noData ? (
          <div className="empty">No data generated for this tool in this run.</div>
        ) : (
          <div className="gauge-grid">
            <Speedometer
              label="Throughput"
              value={p.rps}
              max={p.maxRps}
              unit={`req/s · peak ${p.maxRps}`}
              thresholdGood={p.maxRps * 0.4}
              thresholdBad={p.maxRps * 0.7}
            />
            <Speedometer
              label="Avg response"
              value={p.avgMs}
              max={1000}
              unit="milliseconds"
              invert
              thresholdGood={200}
              thresholdBad={500}
            />
            <Speedometer
              label="P95 latency"
              value={p.p95Ms}
              max={1500}
              unit="milliseconds"
              invert
              thresholdGood={400}
              thresholdBad={800}
            />
            <Speedometer
              label="Error rate"
              value={p.errorRate}
              max={5}
              unit="% of requests"
              invert
              thresholdGood={0.5}
              thresholdBad={1.5}
            />
          </div>
        )}
      </div>

      {!noData && (
        <div className="perf-grid">
          <div className="panel">
            <h3>Response time distribution</h3>
            {p.distribution.map((d, i) => (
              <div className="dist-row" key={i}>
                <div className="pct">{d.label}</div>
                <div className="bar-track">
                  <div
                    className="bar-fill"
                    style={{ width: (d.pct / maxDist) * 100 + '%' }}
                  />
                </div>
                <div className="ms">{d.pct}%</div>
              </div>
            ))}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginTop: 14,
                fontSize: 12,
                color: 'var(--text-mute)',
                fontFamily: 'var(--mono)',
              }}
            >
              <span>Total requests: {p.requests.toLocaleString()}</span>
              <span>P99: {p.p99Ms}ms</span>
            </div>
          </div>

          <div className="panel">
            <h3>Simulations</h3>
            <div className="sim-list">
              {p.scenarios.map((sim, i) => (
                <SimulationCard key={i} sim={sim} />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SimulationCard({ sim }: { sim: PerfScenario }) {
  const [open, setOpen] = useState(sim.errors > 0);
  const hasSteps = Boolean(sim.steps && sim.steps.length);
  return (
    <div className={`scenario-card${open ? ' is-open' : ''}`}>
      <button
        type="button"
        className="scenario-card-head"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={'icon-dot ' + (sim.errors > 1 ? 'failed' : sim.errors > 0.3 ? 'skipped' : 'passed')} />
        <span className="name">{sim.name}</span>
        <span className="meta">{sim.rps} rps · p95 {sim.p95}ms · err {sim.errors}%</span>
        <span className="chev">{open ? '▾' : '▸'}</span>
      </button>
      {open && hasSteps && (
        <div className="scenario-card-body">
          <table className="sim-steps">
            <thead>
              <tr><th>Step</th><th>RPS</th><th>P95 (ms)</th><th>%KO</th></tr>
            </thead>
            <tbody>
              {[...(sim.steps ?? [])].sort((a, b) => b.errors - a.errors).map((s, idx) => (
                <tr key={idx} className={s.errors > 0 ? 'sim-step-bad' : undefined}>
                  <td>{s.name}</td>
                  <td>{s.rps}</td>
                  <td>{s.p95}</td>
                  <td>{s.errors}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {open && !hasSteps && (
        <div className="scenario-card-body empty">No per-request breakdown available.</div>
      )}
    </div>
  );
}
