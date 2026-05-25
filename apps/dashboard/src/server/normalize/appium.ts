import type { MobileUiTool } from '../../shared/types.js';
import { type AdapterContext, assertObject } from './shared.js';

export function appiumAdapter(raw: unknown, _ctx: AdapterContext): MobileUiTool {
  const data = assertObject(raw, 'appium') as Omit<MobileUiTool, 'kind'>;
  return { ...data, kind: 'mobile_ui' };
}
