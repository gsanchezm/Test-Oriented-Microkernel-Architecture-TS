import type { Tool } from '@shared/types';
import {
  TabbedTestDetail,
  type DetailTab,
  type DetailTabGroup,
} from '../../components/TabbedTestDetail';
import { BrowserLogo, prettyBrowser } from '../../components/ToolLogo';
import { GenericDetail } from './GenericDetail';

interface WebUiDetailProps {
  runId: string;
  tool: Tool;
}

/** 'desktop' → 'Desktop', 'responsive' → 'Responsive', else Title-cased as-is. */
function prettyViewport(viewport: string): string {
  if (viewport === 'desktop') return 'Desktop';
  if (viewport === 'responsive') return 'Responsive';
  return viewport.charAt(0).toUpperCase() + viewport.slice(1);
}

/** Inline marker (no image assets): 🖥 for desktop, 📱 for responsive. */
function viewportMarker(viewport: string): string {
  if (viewport === 'responsive') return '📱';
  return '🖥';
}

/**
 * Detail view for `web_ui` tools (Playwright).
 *
 * Precedence:
 *  1. `viewports` → outer viewport tabs (Desktop/Responsive), each with inner
 *     per-browser tabs.
 *  2. `browsers` → flat per-browser tabs (legacy single-viewport).
 *  3. neither → flat single-list GenericDetail.
 */
export function WebUiDetail({ runId, tool }: WebUiDetailProps) {
  if (tool.kind === 'web_ui' && tool.viewports && tool.viewports.length > 0) {
    const groups: DetailTabGroup[] = tool.viewports.map((vp) => ({
      id: vp.viewport,
      label: prettyViewport(vp.viewport),
      logo: <span aria-hidden>{viewportMarker(vp.viewport)}</span>,
      tabs: vp.browsers.map<DetailTab>((b) => ({
        id: b.browser,
        label: prettyBrowser(b.browser),
        logo: <BrowserLogo browser={b.browser} size={20} />,
        subtitle: prettyBrowser(b.browser),
        block: b,
      })),
    }));
    return (
      <TabbedTestDetail
        runId={runId}
        tool={tool}
        tabs={[]}
        groups={groups}
        toolMissing={tool.missing}
      />
    );
  }

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

  // No breakdown → flat test list.
  return <GenericDetail runId={runId} tool={tool} />;
}
