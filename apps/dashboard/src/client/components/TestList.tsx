import { Fragment } from 'react';

import type { TestCase } from '@shared/types';
import type { TestFilter } from './FilterBar';

interface TestListProps {
  tests: TestCase[];
  filter: TestFilter;
  query: string;
}

export function TestList({ tests, filter, query }: TestListProps) {
  const q = query.toLowerCase();
  const filtered = tests.filter((t) => {
    if (filter !== 'all' && t.status !== filter) return false;
    if (q && !`${t.name} ${t.suite} ${t.file}`.toLowerCase().includes(q)) return false;
    return true;
  });

  if (!filtered.length) {
    return <div className="empty">No tests match this filter.</div>;
  }

  return (
    <div className="tests">
      {filtered.map((t, i) => (
        <Fragment key={`${t.file}:${t.name}:${i}`}>
          <div className="test-row">
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
          </div>
          {t.error && t.status === 'failed' && <div className="failure">{t.error}</div>}
        </Fragment>
      ))}
    </div>
  );
}
