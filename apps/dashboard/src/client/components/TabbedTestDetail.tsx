import { type ReactNode, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

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

/**
 * Optional second (outer) tab level. When provided, an outer strip renders one
 * button per group; the active group supplies the inner `tabs`. Used by the web
 * viewport→browser nesting (Desktop/Responsive → Chrome/Firefox/...).
 */
export interface DetailTabGroup {
  id: string;
  label: string;
  logo: ReactNode;
  tabs: DetailTab[];
}

interface TabbedTestDetailProps {
  runId: string;
  tool: Tool;
  tabs: DetailTab[];
  /** When set, render an outer group strip above the inner tab strip. */
  groups?: DetailTabGroup[];
  /** When true (tool missing or block empty), the test list area shows a banner. */
  toolMissing?: boolean;
}

/**
 * Shared tabbed detail layout: header + a tab strip (logo + label + test
 * count) + per-tab donut/KPIs/suites + a filtered test list. Used by both
 * the mobile (Android/iOS) and web (per-browser) detail views so they look
 * identical.
 *
 * When `groups` is supplied, an OUTER tab strip (one button per group) renders
 * above the inner tab strip; otherwise behavior is exactly the flat single-level
 * layout. DetailHead renders exactly once either way.
 */
export function TabbedTestDetail({ runId, tool, tabs, groups, toolMissing }: TabbedTestDetailProps) {
  const useGroups = !!groups && groups.length > 0;
  return useGroups ? (
    <GroupedTabbedDetail runId={runId} tool={tool} groups={groups!} toolMissing={toolMissing} />
  ) : (
    <FlatTabbedDetail runId={runId} tool={tool} tabs={tabs} toolMissing={toolMissing} />
  );
}

/* ------------------------------------------------------------------ *
 * Shared body: tab strip + donut/KPIs/suites + filtered test list.
 * `tabs` is the strip to render; `active` is the selected tab; `onSelect`
 * switches it. `animateKey` keys the donut animation. The outer strip (if
 * any) is passed in via `header`.
 * ------------------------------------------------------------------ */
function DetailBody({
  tabs,
  active,
  onSelect,
  animateKey,
  toolMissing,
  header,
}: {
  tabs: DetailTab[];
  active: DetailTab;
  onSelect: (id: string) => void;
  animateKey: string;
  toolMissing?: boolean;
  header?: ReactNode;
}) {
  const [filter, setFilter] = useState<TestFilter>('all');
  const [query, setQuery] = useState('');
  const [searchParams] = useSearchParams();
  const expandScenarioName = searchParams.get('expand');

  const tests = active.block.tests ?? [];
  const counts = useMemo(
    () => ({
      all: tests.length,
      passed:  tests.filter((t) => t.status === 'passed').length,
      failed:  tests.filter((t) => t.status === 'failed').length,
      skipped: tests.filter((t) => t.status === 'skipped').length,
    }),
    [tests],
  );

  const data = active.block;
  const total = data.passed + data.failed + data.skipped;
  const passRate = total === 0 ? '0.0%' : ((data.passed / total) * 100).toFixed(1) + '%';
  const noData = toolMissing === true || tests.length === 0;
  const suitePills = data.suites.length > 0 ? data.suites : ['—'];

  return (
    <>
      <div className="panel" style={{ paddingBottom: 18 }}>
        {header}
        <div className="platform-tabs">
          {tabs.map((t) => {
            const tTotal = t.block.passed + t.block.failed + t.block.skipped;
            return (
              <button
                key={t.id}
                type="button"
                className={t.id === active.id ? 'active' : ''}
                onClick={() => onSelect(t.id)}
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
              animateKey={animateKey}
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
            <TestList tests={tests} filter={filter} query={query} expandScenarioName={expandScenarioName} />
          </>
        )}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ *
 * Flat (single-level) layout — behavior is exactly as before groups.
 * ------------------------------------------------------------------ */
function FlatTabbedDetail({
  runId,
  tool,
  tabs,
  toolMissing,
}: {
  runId: string;
  tool: Tool;
  tabs: DetailTab[];
  toolMissing?: boolean;
}) {
  const [activeId, setActiveId] = useState(tabs[0]?.id ?? '');
  const active = tabs.find((t) => t.id === activeId) ?? tabs[0];

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
      <DetailBody
        tabs={tabs}
        active={active}
        onSelect={setActiveId}
        animateKey={active.id}
        toolMissing={toolMissing}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Grouped (two-level) layout — outer group strip + inner tab strip.
 * ------------------------------------------------------------------ */
function GroupedTabbedDetail({
  runId,
  tool,
  groups,
  toolMissing,
}: {
  runId: string;
  tool: Tool;
  groups: DetailTabGroup[];
  toolMissing?: boolean;
}) {
  const [searchParams] = useSearchParams();
  const expandScenarioName = searchParams.get('expand');

  // Deep-link: select both the group and inner tab whose block.tests contains
  // a test named `expand`. Lazy init so later user clicks aren't clobbered.
  const deepLink = useMemo(() => {
    if (!expandScenarioName) return null;
    for (const g of groups) {
      const tab = g.tabs.find((t) => t.block.tests.some((tc) => tc.name === expandScenarioName));
      if (tab) return { groupId: g.id, tabId: tab.id };
    }
    return null;
    // groups identity is stable per render of the parent; expand only changes on nav.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandScenarioName]);

  const [activeGroupId, setActiveGroupId] = useState<string>(() => deepLink?.groupId ?? groups[0]?.id ?? '');
  const activeGroup = groups.find((g) => g.id === activeGroupId) ?? groups[0];

  const [activeTabId, setActiveTabId] = useState<string>(
    () => deepLink?.tabId ?? activeGroup?.tabs[0]?.id ?? '',
  );

  const activeTab =
    activeGroup?.tabs.find((t) => t.id === activeTabId) ?? activeGroup?.tabs[0];

  if (!activeGroup || !activeTab) {
    return (
      <div className="detail fade-in">
        <DetailHead runId={runId} tool={tool} />
        <div className="panel">
          <div className="empty">No data generated for this tool in this run.</div>
        </div>
      </div>
    );
  }

  const selectGroup = (g: DetailTabGroup) => {
    setActiveGroupId(g.id);
    setActiveTabId(g.tabs[0]?.id ?? '');
  };

  const outerStrip = (
    <div className="platform-tabs" style={{ marginBottom: 14 }}>
      {groups.map((g) => {
        const gTotal = g.tabs.reduce(
          (sum, t) => sum + t.block.passed + t.block.failed + t.block.skipped,
          0,
        );
        return (
          <button
            key={g.id}
            type="button"
            className={g.id === activeGroup.id ? 'active' : ''}
            onClick={() => selectGroup(g)}
          >
            {g.logo} {g.label}
            <span
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 11,
                color: 'var(--text-mute)',
                marginLeft: 4,
              }}
            >
              {gTotal} tests
            </span>
          </button>
        );
      })}
    </div>
  );

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
      <DetailBody
        key={activeGroup.id}
        tabs={activeGroup.tabs}
        active={activeTab}
        onSelect={setActiveTabId}
        animateKey={`${activeGroup.id}/${activeTab.id}`}
        toolMissing={toolMissing}
        header={outerStrip}
      />
    </div>
  );
}
