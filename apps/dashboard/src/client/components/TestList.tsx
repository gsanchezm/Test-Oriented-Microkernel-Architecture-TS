import { useMemo, useState, useEffect } from 'react';

import type { TestCase } from '@shared/types';
import { StepList } from './StepList';
import type { TestFilter } from './FilterBar';

interface TestListProps {
  tests: TestCase[];
  filter: TestFilter;
  query: string;
  /** When set, the row whose `name` matches starts expanded in addition to the auto-expanded failed rows. */
  expandScenarioName?: string | null;
}

const keyOf = (t: TestCase, i: number) => `${t.file}:${t.name}:${i}`;

export function TestList({ tests, filter, query, expandScenarioName }: TestListProps) {
  const q = query.toLowerCase();
  const filtered = tests
    .map((t, i) => ({ t, i }))
    .filter(({ t }) => {
      if (filter !== 'all' && t.status !== filter) return false;
      if (q && !`${t.name} ${t.suite} ${t.file}`.toLowerCase().includes(q)) return false;
      return true;
    });

  const initial = useMemo(() => {
    const set = new Set<string>();
    tests.forEach((t, i) => {
      if (t.status === 'failed') set.add(keyOf(t, i));
      if (expandScenarioName && t.name === expandScenarioName) set.add(keyOf(t, i));
    });
    return set;
  }, [tests, expandScenarioName]);

  const [expanded, setExpanded] = useState<Set<string>>(initial);

  // Reseed when the test set or the deep-link target changes.
  useEffect(() => { setExpanded(initial); }, [initial]);

  if (!filtered.length) {
    return <div className="empty">No tests match this filter.</div>;
  }

  const toggle = (k: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  };

  return (
    <div className="tests">
      {filtered.map(({ t, i }) => {
        const k = keyOf(t, i);
        const isOpen = expanded.has(k);
        return (
          <div className="test-row-group" key={k}>
            <button
              type="button"
              className={`test-row test-row-toggle${isOpen ? ' is-open' : ''}`}
              aria-expanded={isOpen}
              onClick={() => toggle(k)}
            >
              <span className={'icon-dot ' + t.status} />
              <div>
                <div className="name">{t.name}</div>
                <div className="file">{t.file}</div>
              </div>
              <div className="suite">{t.suite}</div>
              <div className="dur">{t.dur}</div>
              <div>
                <span className={'test-status ' + t.status}>{t.status}</span>
              </div>
              <span className="chev">{isOpen ? '▾' : '▸'}</span>
            </button>
            {isOpen && (
              <div className="test-row-body">
                {t.steps && t.steps.length > 0
                  ? <StepList steps={t.steps} failedStepIndex={t.failedStepIndex} />
                  : t.error
                    ? <pre className="failure">{t.error}</pre>
                    : <div className="empty">No step data captured for this run.</div>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
