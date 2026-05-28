import { existsSync } from 'node:fs';
import path from 'node:path';

import type { VisualDiff, VisualDiffImages, VisualTool } from '../../shared/types.js';
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

/**
 * Resolve the image URLs for a diff, only emitting `baseline`/`diff` when the
 * PNG actually exists on disk. Passed/identical snapshots have no diff.png (and
 * first-run bootstraps have no baseline.png), so always returning those URLs
 * produced broken `<img>` 500s. `actual` always exists by construction.
 *
 * Note: ingest writes the PNGs with the raw (non-URL-encoded) `baseline` as the
 * filename prefix, so we check disk with the raw name but encode the URL.
 */
function imageUrlsFor(ctx: AdapterContext, baseline: string): VisualDiffImages {
  const urlBase = `/reports/${encodeURIComponent(ctx.runId)}/pixelmatch/${encodeURIComponent(baseline)}`;
  const diskBase = path.join(ctx.runDir, 'pixelmatch', baseline);

  const images: VisualDiffImages = {
    actual: `${urlBase}-actual.png`,
  };
  if (existsSync(`${diskBase}-baseline.png`)) images.baseline = `${urlBase}-baseline.png`;
  if (existsSync(`${diskBase}-diff.png`)) images.diff = `${urlBase}-diff.png`;
  return images;
}
