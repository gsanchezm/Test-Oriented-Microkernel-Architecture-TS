import type { TestStep } from '@shared/types';

interface StepListProps {
  steps?: TestStep[];
  failedStepIndex?: number;
}

const STATUS_ICON: Record<TestStep['status'], string> = {
  passed: '○',
  failed: '✕',
  skipped: '◐',
};

export function StepList({ steps, failedStepIndex }: StepListProps) {
  if (!steps || steps.length === 0) {
    return <div className="empty">No step data captured for this run.</div>;
  }

  return (
    <ol className="step-list">
      {steps.map((s, i) => {
        const isFailed = i === failedStepIndex;
        const classes = ['step'];
        if (isFailed) classes.push('step-failed');
        if (s.status === 'skipped' && !isFailed) classes.push('step-skipped');
        if (s.hidden) classes.push('step-hook');
        return (
          <li className={classes.join(' ')} key={i}>
            <span className="step-icon">{s.hidden ? '🪝' : STATUS_ICON[s.status]}</span>
            <span className="step-text">
              <strong className="step-keyword">{s.keyword}</strong>
              <span className="step-name">{s.name}</span>
            </span>
            {s.location && <span className="step-location">{s.location}</span>}
            <span className="step-dur">{s.dur}</span>
            {isFailed && s.error && (
              <pre className="step-error">{s.error}</pre>
            )}
          </li>
        );
      })}
    </ol>
  );
}
