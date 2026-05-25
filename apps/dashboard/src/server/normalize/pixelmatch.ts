import type { VisualDiff, VisualTool } from '../../shared/types.js';
import { type AdapterContext, assertObject } from './shared.js';

type RawVisualDiff = Omit<VisualDiff, 'images'>;
type RawVisualTool = Omit<VisualTool, 'kind' | 'diffs'> & {
  diffs: RawVisualDiff[];
};

export function pixelmatchAdapter(raw: unknown, ctx: AdapterContext): VisualTool {
  const data = assertObject(raw, 'pixelmatch') as RawVisualTool;
  return {
    ...data,
    kind: 'visual',
    diffs: data.diffs.map((d) => ({
      ...d,
      images: imageUrlsFor(ctx, d.baseline),
    })),
  };
}

function imageUrlsFor(ctx: AdapterContext, baseline: string) {
  const base = `/reports/${encodeURIComponent(ctx.runId)}/pixelmatch/${encodeURIComponent(baseline)}`;
  return {
    baseline: `${base}-baseline.png`,
    actual: `${base}-actual.png`,
    diff: `${base}-diff.png`,
  };
}
