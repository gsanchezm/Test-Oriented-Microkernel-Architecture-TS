import type { Status } from '@shared/types';

export type TestFilter = 'all' | Status;

interface FilterBarProps {
  filter: TestFilter;
  onFilter: (f: TestFilter) => void;
  query: string;
  onQuery: (q: string) => void;
  counts: Record<TestFilter, number>;
}

export function FilterBar({ filter, onFilter, query, onQuery, counts }: FilterBarProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, gap: 12 }}>
      <div className="filter-tabs">
        <FilterButton active={filter === 'all'} onClick={() => onFilter('all')} label="All" count={counts.all} />
        <FilterButton active={filter === 'passed'} onClick={() => onFilter('passed')} label="Passed" count={counts.passed} dotClass="passed" />
        <FilterButton active={filter === 'failed'} onClick={() => onFilter('failed')} label="Failed" count={counts.failed} dotClass="failed" />
        <FilterButton active={filter === 'skipped'} onClick={() => onFilter('skipped')} label="Skipped" count={counts.skipped} dotClass="skipped" />
      </div>
      <div className="search">
        <SearchIcon />
        <input
          placeholder="Filter by name, suite, file…"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
        />
      </div>
    </div>
  );
}

function FilterButton({
  active,
  onClick,
  label,
  count,
  dotClass,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  dotClass?: string;
}) {
  return (
    <button className={active ? 'active' : ''} onClick={onClick} type="button">
      {dotClass && <span className={`icon-dot ${dotClass}`} style={{ width: 8, height: 8 }} />}
      {label}
      <b style={{ opacity: 0.6 }}>{count}</b>
    </button>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 16 16" width={14} height={14} fill="none">
      <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.6" />
      <line x1="10.5" y1="10.5" x2="14" y2="14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
