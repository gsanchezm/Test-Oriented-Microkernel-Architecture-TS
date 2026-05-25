import type { Tool } from '@shared/types';
import { TabbedTestDetail, type DetailTab } from '../../components/TabbedTestDetail';
import { PlatformLogo } from '../../components/ToolLogo';

interface MobileDetailProps {
  runId: string;
  tool: Tool;
}

/** Detail view for `mobile_ui` tools: Android/iOS tabs with per-platform donut, KPIs, and tests. */
export function MobileDetail({ runId, tool }: MobileDetailProps) {
  if (tool.kind !== 'mobile_ui') {
    return (
      <div className="state">
        <div className="title">MobileDetail received an unexpected tool kind</div>
        <div>
          <code>{tool.kind}</code>
        </div>
      </div>
    );
  }

  const tabs: DetailTab[] = [
    {
      id: 'android',
      label: 'Android',
      logo: <PlatformLogo platform="android" size={20} />,
      subtitle: tool.platforms.android.device || '—',
      block: tool.platforms.android,
    },
    {
      id: 'ios',
      label: 'iOS',
      logo: <PlatformLogo platform="ios" size={20} />,
      subtitle: tool.platforms.ios.device || '—',
      block: tool.platforms.ios,
    },
  ];

  return <TabbedTestDetail runId={runId} tool={tool} tabs={tabs} toolMissing={tool.missing} />;
}
