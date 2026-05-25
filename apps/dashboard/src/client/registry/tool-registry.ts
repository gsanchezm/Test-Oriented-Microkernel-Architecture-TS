import type { ComponentType } from 'react';

import type { ToolKind } from '@shared/kinds';
import type { Tool } from '@shared/types';
import { GenericDetail } from '../views/detail/GenericDetail';
import { MobileDetail } from '../views/detail/MobileDetail';
import { PerformanceDetail } from '../views/detail/PerformanceDetail';
import { VisualDetail } from '../views/detail/VisualDetail';
import { WebUiDetail } from '../views/detail/WebUiDetail';

export type DetailComponent = ComponentType<{ runId: string; tool: Tool }>;

/**
 * Map each tool kind to its detail view. Add a new kind here when a new
 * adapter ships on the server and the matching detail view is implemented.
 */
export const DETAIL_BY_KIND: Record<ToolKind, DetailComponent> = {
  web_ui:      WebUiDetail,
  api:         GenericDetail,
  mobile_ui:   MobileDetail,
  performance: PerformanceDetail,
  visual:      VisualDetail,
};

export function logoUrl(toolId: string): string {
  return `/assets/logos/${encodeURIComponent(toolId)}.svg`;
}

export function platformLogoUrl(platform: 'android' | 'ios'): string {
  return `/assets/logos/platforms/${platform}.svg`;
}
