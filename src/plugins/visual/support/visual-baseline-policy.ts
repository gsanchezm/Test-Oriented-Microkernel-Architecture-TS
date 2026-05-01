// Baseline lifecycle policy.
//
// Default behavior is intentionally strict for scientific reproducibility:
//   - missing baseline = FAIL.
//   - never silently overwrite an existing baseline.
//
// Two opt-in escape hatches, both explicit:
//   1. UPDATE_BASELINE action — the *user* asked for it.
//   2. VISUAL_UPDATE_BASELINE=true env var — bootstrap mode, marks the run
//      as PASS with `baselineCreated=true` so the telemetry stream still
//      reflects that the run did not perform a real comparison.

import { existsSync, copyFileSync } from 'fs';
import { writeFileSync } from 'fs';
import { baselinePaths, ensureDir, VisualPathKey } from '@plugins/visual/support/visual-paths';
import { VisualThresholds } from '@core/contracts/visual-contract.types';
import { VisualThresholdsApplied } from '@plugins/visual/support/visual-result.types';

export function isUpdateBaselineEnv(): boolean {
    return (process.env.VISUAL_UPDATE_BASELINE || '').toLowerCase() === 'true';
}

export function baselineExists(key: VisualPathKey): boolean {
    return existsSync(baselinePaths(key).baselinePath);
}

export function writeBaselineFromBuffer(key: VisualPathKey, png: Buffer): string {
    const { baselineDir, baselinePath } = baselinePaths(key);
    ensureDir(baselineDir);
    writeFileSync(baselinePath, png);
    return baselinePath;
}

export function copyActualToBaseline(key: VisualPathKey, actualPath: string): string {
    const { baselineDir, baselinePath } = baselinePaths(key);
    ensureDir(baselineDir);
    copyFileSync(actualPath, baselinePath);
    return baselinePath;
}

const DEFAULT_MAX_DIFF_PIXELS = 0;
const DEFAULT_MAX_DIFF_RATIO = 0;

export function resolveThresholds(thresholds?: VisualThresholds): VisualThresholdsApplied {
    return {
        maxDiffPixels: typeof thresholds?.pixelCount === 'number' ? thresholds.pixelCount : DEFAULT_MAX_DIFF_PIXELS,
        maxDiffRatio: typeof thresholds?.pixelRatio === 'number' ? thresholds.pixelRatio : DEFAULT_MAX_DIFF_RATIO,
    };
}
