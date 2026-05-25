import type { ApiTool } from '../../shared/types.js';
import { type AdapterContext, assertObject } from './shared.js';

export function apiAdapter(raw: unknown, _ctx: AdapterContext): ApiTool {
  const data = assertObject(raw, 'api') as Omit<ApiTool, 'kind'>;
  return { ...data, kind: 'api' };
}
