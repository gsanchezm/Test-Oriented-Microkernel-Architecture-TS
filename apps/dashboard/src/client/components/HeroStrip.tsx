import type { ToolSummary } from '@shared/types';

interface HeroStripProps {
  tools: ToolSummary[];
}

export function HeroStrip({ tools }: HeroStripProps) {
  const totals = tools.reduce(
    (acc, t) => {
      acc.passed += t.passed;
      acc.failed += t.failed;
      acc.skipped += t.skipped;
      return acc;
    },
    { passed: 0, failed: 0, skipped: 0 },
  );
  const total = totals.passed + totals.failed + totals.skipped;
  const passPct = total === 0 ? '0.0' : ((totals.passed / total) * 100).toFixed(1);

  return (
    <div className="hero">
      <div className="hero-card big">
        <div className="title">Overall Run Health</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
          <div className="value">{passPct}%</div>
          <div style={{ fontSize: 14, color: 'var(--text-mute)' }}>
            {totals.passed.toLocaleString()} of {total.toLocaleString()} tests passed
          </div>
        </div>
        <div className="summary" style={{ marginTop: 12 }}>
          Across {tools.length} testing tools — {totals.failed} failures need triage,{' '}
          {totals.skipped} cases skipped.
        </div>
        <div className="bar">
          <span style={{ flex: totals.passed, background: 'var(--pass)' }} />
          <span style={{ flex: totals.failed, background: 'var(--fail)' }} />
          <span style={{ flex: totals.skipped, background: 'var(--skip)' }} />
        </div>
      </div>
      <HeroCard label="Tests Executed" value={total.toLocaleString()} />
      <HeroCard label="Passed" value={totals.passed.toLocaleString()} color="var(--pass)" />
      <HeroCard label="Failed" value={String(totals.failed)} color="var(--fail)" />
      <HeroCard label="Skipped" value={String(totals.skipped)} color="var(--skip)" />
    </div>
  );
}

function HeroCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="hero-card">
      <div className="label">{label}</div>
      <div className="value" style={color ? { color } : undefined}>
        {value}
      </div>
    </div>
  );
}
