import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { TestList } from '../../src/client/components/TestList';
import type { TestCase } from '../../src/shared/types';

const tests: TestCase[] = [
  {
    name: 'happy path', suite: 'Auth', file: 'auth.feature', dur: '500ms', status: 'passed',
    steps: [{ keyword: 'Given ', name: 'preconditions', status: 'passed', dur: '200ms' }],
  },
  {
    name: 'broken path', suite: 'Auth', file: 'auth.feature', dur: '900ms', status: 'failed', error: 'boom',
    steps: [
      { keyword: 'Given ', name: 'preconditions', status: 'passed', dur: '200ms' },
      { keyword: 'When ',  name: 'broken action', status: 'failed', dur: '700ms', error: 'boom' },
    ],
    failedStepIndex: 1,
  },
];

describe('TestList accordion', () => {
  it('auto-expands failed scenarios on first render', () => {
    render(<TestList tests={tests} filter="all" query="" />);
    expect(screen.getByText(/broken action/)).toBeInTheDocument();
  });

  it('keeps passed scenarios collapsed by default', () => {
    render(<TestList tests={[tests[0]]} filter="all" query="" />);
    expect(screen.queryByText(/preconditions/)).toBeNull();
  });

  it('toggles expansion on click', () => {
    render(<TestList tests={[tests[0]]} filter="all" query="" />);
    fireEvent.click(screen.getByText(/happy path/));
    expect(screen.getByText(/preconditions/)).toBeInTheDocument();
    fireEvent.click(screen.getByText(/happy path/));
    expect(screen.queryByText(/preconditions/)).toBeNull();
  });

  it('seeds expansion from the expandScenarioName prop', () => {
    render(<TestList tests={tests} filter="all" query="" expandScenarioName="happy path" />);
    // Both the auto-expanded failed AND the deep-linked passed scenario render their step content.
    // Both scenarios share a step named "preconditions", so getAllByText finds 2 instances when both are open.
    expect(screen.getAllByText(/preconditions/)).toHaveLength(2);
    expect(screen.getByText(/broken action/)).toBeInTheDocument();
  });

  it('falls back to scenario-level error when steps[] is absent', () => {
    const legacy: TestCase[] = [
      { name: 'old test', suite: 'Auth', file: 'auth.feature', dur: '100ms', status: 'failed', error: 'legacy boom' },
    ];
    render(<TestList tests={legacy} filter="all" query="" />);
    expect(screen.getByText(/legacy boom/)).toBeInTheDocument();
  });
});
