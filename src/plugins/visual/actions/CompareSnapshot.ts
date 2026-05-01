// COMPARE_SNAPSHOT — capture, locate baseline, run pixelmatch, write
// diff + result.json, emit telemetry, and throw on mismatch.
//
// Bootstrap mode (VISUAL_UPDATE_BASELINE=true OR target options.saveActualOnly):
//   - missing baseline becomes PASS with baselineCreated=true.
//   - the run still emits telemetry so research datasets capture the
//     "no baseline yet" event distinctly from a real comparison.

import { readFileSync, writeFileSync } from 'fs';
import { ActionHandler } from '@plugins/shared/ActionHandler';
import { VisualActionContext } from '@plugins/visual/actions/VisualActionContext';
import { parseVisualTarget } from '@plugins/visual/actions/visual-target-options';
import { VisualContractLoader } from '@core/contracts/visual-contract-loader';
import { resolveVisualTarget } from '@core/contracts/visual-target-resolver';
import {
    baselinePaths,
    resultPaths,
    ensureDir,
    VisualPathKey,
} from '@plugins/visual/support/visual-paths';
import { resolveScreenshotSource } from '@plugins/visual/support/screenshot-source-factory';
import {
    baselineExists,
    isUpdateBaselineEnv,
    resolveThresholds,
    writeBaselineFromBuffer,
} from '@plugins/visual/support/visual-baseline-policy';
import { comparePngBuffers } from '@plugins/visual/support/visual-image-utils';
import { emitVisualTelemetry } from '@plugins/visual/support/visual-telemetry';
import { VisualComparisonResult } from '@plugins/visual/support/visual-result.types';

export const CompareSnapshotAction: ActionHandler<VisualActionContext> = {
    name: 'COMPARE_SNAPSHOT',
    async execute(ctx) {
        const opts = parseVisualTarget(ctx.target);
        const snapshot = VisualContractLoader.getSnapshot(opts.feature, opts.snapshotId);
        const resolved = resolveVisualTarget(snapshot, { strict: false });

        const key: VisualPathKey = {
            feature: opts.feature,
            snapshotId: opts.snapshotId,
            platform: opts.platform,
            viewport: opts.viewport,
        };

        const thresholds = resolveThresholds(snapshot.thresholds);
        const startedAt = Date.now();
        const result: VisualComparisonResult = {
            feature: opts.feature,
            snapshotId: opts.snapshotId,
            regionRef: snapshot.regionRef,
            resolvedRegion: resolved.resolvedRegion,
            resolvedRegionStrategy: resolved.resolvedRegionStrategy,
            maskRefs: snapshot.maskRefs ?? [],
            resolvedMaskCount: resolved.resolvedMasks.length,
            platform: opts.platform,
            viewport: opts.viewport,
            status: 'UNKNOWN',
            durationMs: 0,
            baselinePath: null,
            actualPath: null,
            diffPath: null,
            diffPixels: null,
            totalPixels: null,
            diffRatio: null,
            threshold: thresholds,
            passed: null,
            baselineCreated: false,
            errorMessage: null,
        };

        try {
            // 1. Capture actual
            const source = ctx.screenshotSource ?? resolveScreenshotSource(opts.platform);
            const actualPng = await source.capture({
                platform: opts.platform,
                viewport: opts.viewport,
                sessionId: ctx.sessionId,
                regionSelector: resolved.resolvedRegion ?? undefined,
                maskSelectors: resolved.resolvedMasks,
                metadata: ctx.metadata,
            });

            const paths = resultPaths(key);
            ensureDir(paths.runResultDir);
            writeFileSync(paths.actualPath, actualPng);
            result.actualPath = paths.actualPath;

            // 2. Capture-only fast path
            if (opts.saveActualOnly) {
                result.status = 'PASS';
                result.passed = null;
                writeFileSync(paths.resultJsonPath, JSON.stringify(result, null, 2));
                result.durationMs = Date.now() - startedAt;
                await emitTelemetryFor(result, opts, snapshot, resolved.resolvedRegionStrategy, 'CAPTURE_ONLY', ctx.sessionId);
                return JSON.stringify(result);
            }

            // 3. Baseline lookup
            const { baselinePath } = baselinePaths(key);
            const exists = baselineExists(key);

            if (!exists) {
                if (isUpdateBaselineEnv()) {
                    writeBaselineFromBuffer(key, actualPng);
                    result.baselinePath = baselinePath;
                    result.baselineCreated = true;
                    result.status = 'PASS';
                    result.passed = null;
                    result.errorMessage = null;
                } else {
                    result.status = 'FAIL';
                    result.errorMessage =
                        `Missing visual baseline for ${opts.feature}/${opts.snapshotId} (${opts.platform}/${opts.viewport}). ` +
                        `Run UPDATE_BASELINE or set VISUAL_UPDATE_BASELINE=true to bootstrap.`;
                }
            } else {
                result.baselinePath = baselinePath;
                const baselinePng = readFileSync(baselinePath);
                const compare = comparePngBuffers(actualPng, baselinePng, thresholds);
                result.diffPixels = compare.diffPixels;
                result.totalPixels = compare.totalPixels;
                result.diffRatio = compare.diffRatio;
                result.passed = compare.passed;
                result.status = compare.passed ? 'PASS' : 'FAIL';
                result.errorMessage = compare.error;

                if (compare.diffPng) {
                    writeFileSync(paths.diffPath, compare.diffPng);
                    result.diffPath = paths.diffPath;
                }
            }

            writeFileSync(paths.resultJsonPath, JSON.stringify(result, null, 2));
        } catch (err) {
            result.status = 'FAIL';
            result.errorMessage = (err as Error).message;
        }

        result.durationMs = Date.now() - startedAt;

        await emitTelemetryFor(
            result,
            opts,
            snapshot,
            resolved.resolvedRegionStrategy,
            'COMPARE_SNAPSHOT',
            ctx.sessionId,
        );

        if (result.status === 'FAIL') {
            throw new Error(
                `[COMPARE_SNAPSHOT] ${opts.feature}/${opts.snapshotId}: ${result.errorMessage ?? 'failed'}`,
            );
        }

        return JSON.stringify(result);
    },
};

async function emitTelemetryFor(
    result: VisualComparisonResult,
    opts: { feature: string; snapshotId: string; platform: string; viewport: string },
    snapshot: { telemetry?: { enabled?: boolean }; regionRef: string; maskRefs?: string[] },
    resolvedRegionStrategy: string | null,
    action: string,
    sessionId: string,
): Promise<void> {
    if (snapshot.telemetry?.enabled === false) return;
    await emitVisualTelemetry({
        feature: opts.feature,
        snapshotId: opts.snapshotId,
        regionRef: snapshot.regionRef,
        resolvedRegionStrategy,
        maskRefs: snapshot.maskRefs ?? [],
        resolvedMaskCount: result.resolvedMaskCount,
        platform: opts.platform,
        viewport: opts.viewport,
        status: result.status,
        durationMs: result.durationMs,
        baselinePath: result.baselinePath,
        actualPath: result.actualPath,
        diffPath: result.diffPath,
        diffPixels: result.diffPixels,
        diffRatio: result.diffRatio,
        threshold: result.threshold.maxDiffRatio,
        passed: result.passed,
        errorMessage: result.errorMessage,
        metadata: {
            action,
            sessionId,
            baselineCreated: result.baselineCreated,
            maxDiffPixels: result.threshold.maxDiffPixels,
            maxDiffRatio: result.threshold.maxDiffRatio,
        },
    });
}
