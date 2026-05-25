import type { WebUiTool } from '../../shared/types.js';
import { type AdapterContext, assertObject } from './shared.js';

export function playwrightAdapter(raw: unknown, _ctx: AdapterContext): WebUiTool {
  const data = assertObject(raw, 'playwright') as Omit<WebUiTool, 'kind'>;
  return { ...data, kind: 'web_ui' };
}
