import { type ReactNode, useMemo, useState } from 'react';

import type { Counts, TestCase, Tool } from '@shared/types';
import { DetailHead } from './DetailHead';
import { FilterBar, type TestFilter } from './FilterBar';
import { PassFailDonut } from './PassFailDonut';
import { TestList } from './TestList';

export interface DetailTab {
  id: string;
  label: string;
  logo: ReactNode;
  /** Shown in mono under the donut (device for mobile, engine/version for web). */
  subtitle?: string;
  block: Counts & { suites: string[]; tests: TestCase[] };
}

interface TabbedTestDetailProps {
  runId: string;
  tool: Tool;
  tabs: DetailTab[];
  /** When true (tool missing or block empty), the test list area shows a banner. */
  toolMissing?: boolean;
}

/**
 * Shared tabbed detail layout: header + a tab strip (logo + label + test
 * count) + per-tab donut/KPIs/suites + a filtered test list. Used by both
 * the mobile (Android/iOS) and web (per-browser) detail views so they look
 * identical.
 */
export function TabbedTestDetail({ runId, tool, tabs, toolMissing }: TabbedTestDetailProps) {
  const [activeId, setActiveId] = useState(tabs[0]?.id ?? '');
  const [filter, setFilter] = useState<TestFilter>('all');
  const [query, setQuery] = useState('');

  const active = tabs.find((t) => t.id === activeId) ?? tabs[0];

  const tests = active?.block.tests ?? [];
  const counts = useMemo(
    () => ({
      all: tests.length,
      passed:  tests.filter((t) => t.status === 'passed').length,
      failed:  tests.filter((t) => t.status === 'failed').length,
      skipped: tests.filter((t) => t.status === 'skipped').length,
    }),
    [tests],
  );

  if (!active) {
    return (
      <div className="detail fade-in">
        <DetailHead runId={runId} tool={tool} />
        <div className="panel">
          <div className="empty">No data generated for this tool in this run.</div>
        </div>
      </div>
    );
  }

  const data = active.block;
  const total = data.passed + data.failed + data.skipped;
  const passRate = total === 0 ? '0.0%' : ((data.passed / total) * 100).toFixed(1) + '%';
  const noData = toolMissing === true || tests.length === 0;
  const suitePills = data.suites.length > 0 ? data.suites : ['—'];

  return (
    <div className="detail fade-in">
      <DetailHead
        runId={runId}
        tool={tool}
        right={
          <span className="pill" style={{ fontFamily: 'var(--mono)', fontSize: 11.5 }}>
            ⏱ {tool.duration}
          </span>
        }
      />

      <div className="panel" style={{ paddingBottom: 18 }}>
        <div className="platform-tabs">
          {tabs.map((t) => {
            const tTotal = t.block.passed + t.block.failed + t.block.skipped;
            return (
              <button
                key={t.id}
                type="button"
                className={t.id === active.id ? 'active' : ''}
                onClick={() => setActiveId(t.id)}
              >
                {t.logo} {t.label}
                <span
                  style={{
                    fontFamily: 'var(--mono)',
                    fontSize: 11,
                    color: 'var(--text-mute)',
                    marginLeft: 4,
                  }}
                >
                  {tTotal} tests
                </span>
              </button>
            );
          })}
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '180px 1fr',
            gap: 24,
            alignItems: 'center',
            padding: '12px 4px 0',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <PassFailDonut
              passed={data.passed}
              failed={data.failed}
              skipped={data.skipped}
              size={150}
              thickness={16}
              animateKey={active.id}
            />
            {active.subtitle && (
              <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text-mute)' }}>
                {active.subtitle}
              </div>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
            <div className="kpi">
              <div className="label">Total</div>
              <div className="value">{total}</div>
            </div>
            <div className="kpi">
              <div className="label">Pass Rate</div>
              <div className="value pass">{passRate}</div>
            </div>
            <div className="kpi">
              <div className="label">Failed</div>
              <div className="value fail">{data.failed}</div>
            </div>
            <div className="kpi">
              <div className="label">Skipped</div>
              <div className="value skip">{data.skipped}</div>
            </div>
            <div className="kpi" style={{ gridColumn: 'span 4' }}>
              <div className="label">Suites covered</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                {suitePills.map((s, i) => (
                  <span
                    key={`${i}-${s}`}
                    className="pill"
                    style={{ fontSize: 11.5, opacity: data.suites.length === 0 ? 0.5 : 1 }}
                  >
                    {s}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="panel">
        <h3>{active.label} test results</h3>
        {noData ? (
          <div className="empty">No data generated for {active.label} in this run.</div>
        ) : (
          <>
            <FilterBar
              filter={filter}
              onFilter={setFilter}
              query={query}
              onQuery={setQuery}
              counts={counts}
            />
            <TestList tests={tests} filter={filter} query={query} />
          </>
        )}
      </div>
    </div>
  );
}
