import { Link } from 'react-router-dom';

import type { ToolSummary } from '@shared/types';
import { PassFailDonut } from './PassFailDonut';
import { ToolLogo } from './ToolLogo';

interface ToolCardProps {
  runId: string;
  tool: ToolSummary;
}

const KIND_LABEL: Record<ToolSummary['kind'], string> = {
  web_ui:      'Web UI',
  mobile_ui:   'Mobile UI',
  api:         'API · Contract',
  performance: 'Performance · Load',
  visual:      'Visual · Regression',
};

export function ToolCard({ runId, tool }: ToolCardProps) {
  const total = tool.passed + tool.failed + tool.skipped;
  const missing = tool.missing === true;
  const statusKind = missing
    ? 'warn'
    : tool.failed > 0 ? 'fail'
    : tool.skipped > 0 ? 'warn'
    : 'ok';
  const statusLabel = missing
    ? 'No data this run'
    : tool.failed > 0 ? `${tool.failed} failed`
    : tool.skipped > 0 ? `${tool.skipped} skipped`
    : 'All passed';

  return (
    <div className={'tool-card' + (missing ? ' missing' : '')}>
      <div className="tool-card-head">
        <div className="tool-id">
          <div className="tool-logo">
            <ToolLogo toolId={tool.id} size={32} />
          </div>
          <div className="tool-meta">
            <div className="name">{tool.name}</div>
            <div className="kind">{KIND_LABEL[tool.kind]}</div>
          </div>
        </div>
        <div className={'status-chip ' + (statusKind === 'ok' ? '' : statusKind)}>{statusLabel}</div>
      </div>

      <div className="tool-body">
        <div className="tool-stats">
          <div className="big-number">{missing ? '—' : total.toLocaleString()}</div>
          <div className="small">{missing ? 'No report ingested' : 'Test cases ran'}</div>
          {!missing && (
            <div className="breakdown">
              <div>
                <span className="swatch" style={{ background: 'var(--pass)' }} />
                <b>{tool.passed}</b>passed
              </div>
              <div>
                <span className="swatch" style={{ background: 'var(--fail)' }} />
                <b>{tool.failed}</b>failed
              </div>
              <div>
                <span className="swatch" style={{ background: 'var(--skip)' }} />
                <b>{tool.skipped}</b>skipped
              </div>
            </div>
          )}
        </div>
        <PassFailDonut
          passed={tool.passed}
          failed={tool.failed}
          skipped={tool.skipped}
          size={120}
          thickness={14}
          empty={missing}
        />
      </div>

      <div className="tool-foot">
        <span className="duration">⏱ {missing ? '—' : tool.duration}</span>
        <Link to={`/runs/${runId}/${tool.id}`} className={missing ? 'btn subtle' : 'btn'}>
          {missing ? 'See details' : 'View results'} <ChevronRight />
        </Link>
      </div>
    </div>
  );
}

function ChevronRight() {
  return (
    <svg viewBox="0 0 16 16" width={14} height={14} fill="none">
      <path d="M6 3 L 11 8 L 6 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
