import type { Tool } from '@shared/types';
import { TabbedTestDetail, type DetailTab } from '../../components/TabbedTestDetail';
import { BrowserLogo, prettyBrowser } from '../../components/ToolLogo';
import { GenericDetail } from './GenericDetail';

interface WebUiDetailProps {
  runId: string;
  tool: Tool;
}

/**
 * Detail view for `web_ui` tools (Playwright). When the run has a per-browser
 * breakdown, render browser sub-tabs (mirroring the mobile Android/iOS tabs).
 * Otherwise fall back to the flat single-list GenericDetail.
 */
export function WebUiDetail({ runId, tool }: WebUiDetailProps) {
  if (tool.kind === 'web_ui' && tool.browsers && tool.browsers.length > 0) {
    const tabs: DetailTab[] = tool.browsers.map((b) => ({
      id: b.browser,
      label: prettyBrowser(b.browser),
      logo: <BrowserLogo browser={b.browser} size={20} />,
      subtitle: prettyBrowser(b.browser),
      block: b,
    }));
    return <TabbedTestDetail runId={runId} tool={tool} tabs={tabs} toolMissing={tool.missing} />;
  }

  // No browser breakdown → flat test list.
  return <GenericDetail runId={runId} tool={tool} />;
}
