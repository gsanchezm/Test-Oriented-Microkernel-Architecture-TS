import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

import type { Tool } from '@shared/types';
import { ToolLogo } from './ToolLogo';

interface DetailHeadProps {
  runId: string;
  tool: Tool;
  right?: ReactNode;
}

const KIND_LABEL: Record<Tool['kind'], string> = {
  web_ui:      'Web UI',
  mobile_ui:   'Mobile UI',
  api:         'API · Contract',
  performance: 'Performance · Load',
  visual:      'Visual · Regression',
};

export function DetailHead({ runId, tool, right }: DetailHeadProps) {
  return (
    <div className="detail-head">
      <Link to={`/runs/${runId}`} className="btn ghost" style={{ padding: '9px 12px' }}>
        <ChevronLeft /> Back
      </Link>
      <div className="tool-logo">
        <ToolLogo toolId={tool.id} size={38} />
      </div>
      <div>
        <div className="title">{tool.name}</div>
        <div className="sub">
          {KIND_LABEL[tool.kind]} · {tool.description}
        </div>
      </div>
      <div className="right">{right}</div>
    </div>
  );
}

function ChevronLeft() {
  return (
    <svg viewBox="0 0 16 16" width={14} height={14} fill="none">
      <path d="M10 3 L 5 8 L 10 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
