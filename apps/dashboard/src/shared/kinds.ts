export type ToolKind = 'web_ui' | 'mobile_ui' | 'api' | 'performance' | 'visual';

export const TOOL_KINDS: readonly ToolKind[] = [
  'web_ui',
  'mobile_ui',
  'api',
  'performance',
  'visual',
] as const;
