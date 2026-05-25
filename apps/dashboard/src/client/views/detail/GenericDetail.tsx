import { useMemo, useState } from 'react';

import type { Tool } from '@shared/types';
import { DetailHead } from '../../components/DetailHead';
import { FilterBar, type TestFilter } from '../../components/FilterBar';
import { KpiStrip } from '../../components/KpiStrip';
import { TestList } from '../../components/TestList';

interface GenericDetailProps {
  runId: string;
  tool: Tool;
}

/** Used by web_ui and api kinds. Other kinds have dedicated detail views. */
export function GenericDetail({ runId, tool }: GenericDetailProps) {
  if (tool.kind !== 'web_ui' && tool.kind !== 'api') {
    return (
      <div className="state">
        <div className="title">GenericDetail received an unexpected tool kind</div>
        <div>
          <code>{tool.kind}</code>
        </div>
      </div>
    );
  }

  const tests = tool.tests;
  const [filter, setFilter] = useState<TestFilter>('all');
  const [query, setQuery] = useState('');

  const counts = useMemo(
    () => ({
      all: tests.length,
      passed:  tests.filter((t) => t.status === 'passed').length,
      failed:  tests.filter((t) => t.status === 'failed').length,
      skipped: tests.filter((t) => t.status === 'skipped').length,
    }),
    [tests],
  );

  const total = tool.passed + tool.failed + tool.skipped;
  const passRate = total === 0 ? '0.0%' : ((tool.passed / total) * 100).toFixed(1) + '%';

  return (
    <div className="detail fade-in">
      <DetailHead
        runId={runId}
        tool={tool}
        right={
          <>
            <span className="pill" style={{ fontFamily: 'var(--mono)', fontSize: 11.5 }}>
              ⏱ {tool.duration}
            </span>
            <button type="button" className="btn ghost">Export JUnit XML</button>
          </>
        }
      />
      <KpiStrip
        items={[
          { label: 'Tests Run', value: total.toLocaleString() },
          { label: 'Pass Rate', value: passRate, tone: 'pass' },
          { label: 'Passed',    value: tool.passed,  tone: 'pass' },
          { label: 'Failed',    value: tool.failed,  tone: 'fail' },
          { label: 'Skipped',   value: tool.skipped, tone: 'skip' },
        ]}
      />
      <div className="panel">
        <h3>Test results</h3>
        {tool.missing || tests.length === 0 ? (
          <div className="empty">No data generated for this tool in this run.</div>
        ) : (
          <>
            <FilterBar filter={filter} onFilter={setFilter} query={query} onQuery={setQuery} counts={counts} />
            <TestList tests={tests} filter={filter} query={query} />
          </>
        )}
      </div>
    </div>
  );
}
