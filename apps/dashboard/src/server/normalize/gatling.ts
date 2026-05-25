import type { PerformanceTool } from '../../shared/types.js';
import { type AdapterContext, assertObject } from './shared.js';

export function gatlingAdapter(raw: unknown, _ctx: AdapterContext): PerformanceTool {
  const data = assertObject(raw, 'gatling') as Omit<PerformanceTool, 'kind'>;
  return { ...data, kind: 'performance' };
}
