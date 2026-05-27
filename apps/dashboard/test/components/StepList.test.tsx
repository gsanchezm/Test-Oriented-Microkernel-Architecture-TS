import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { StepList } from '../../src/client/components/StepList';
import type { TestStep } from '../../src/shared/types';

const steps: TestStep[] = [
  { keyword: 'Given ', name: 'a fresh user',     status: 'passed', dur: '120ms' },
  { keyword: 'When ',  name: 'they hit submit',  status: 'failed', dur: '480ms', error: 'AssertionError: missing button' },
  { keyword: 'Then ',  name: 'they see results', status: 'skipped', dur: '0ms' },
];

describe('StepList', () => {
  it('renders each step with its keyword and name', () => {
    render(<StepList steps={steps} failedStepIndex={1} />);
    expect(screen.getByText(/a fresh user/)).toBeInTheDocument();
    expect(screen.getByText(/they hit submit/)).toBeInTheDocument();
    expect(screen.getByText(/they see results/)).toBeInTheDocument();
  });

  it('marks the failed step with .step-failed and renders the error inline', () => {
    render(<StepList steps={steps} failedStepIndex={1} />);
    const failed = screen.getByText(/they hit submit/).closest('.step');
    expect(failed).toHaveClass('step-failed');
    expect(screen.getByText(/AssertionError: missing button/)).toBeInTheDocument();
  });

  it('marks hidden hooks with .step-hook and prefixes with the hook icon', () => {
    const hookSteps: TestStep[] = [
      { keyword: 'After', name: '', status: 'failed', dur: '40ms', hidden: true, error: 'cleanup blew up' },
    ];
    render(<StepList steps={hookSteps} failedStepIndex={0} />);
    expect(screen.getByText(/cleanup blew up/)).toBeInTheDocument();
    expect(document.querySelector('.step-hook')).not.toBeNull();
  });

  it('shows a placeholder when steps is undefined', () => {
    render(<StepList />);
    expect(screen.getByText(/no step data/i)).toBeInTheDocument();
  });
});
