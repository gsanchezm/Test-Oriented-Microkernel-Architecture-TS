// CAPTURE_SNAPSHOT — capture and persist an actual.png. Does not
// compare against a baseline; useful for bootstrapping baselines and
// for collecting visuals without making assertions.

import { writeFileSync } from 'fs';
import { ActionHandler } from '@plugins/actions/ActionHandler';
import { VisualActionContext } from '@plugins/actions/visual/VisualActionContext';
import { parseVisualTarget } from '@plugins/actions/visual/visual-target-options';
import { VisualContractLoader } from '@core/contracts/visual-contract-loader';
import { resolveVisualTarget } from '@core/contracts/visual-target-resolver';
import { resultPaths, ensureDir } from '@plugins/visual/support/visual-paths';
import { resolveScreenshotSource } from '@plugins/visual/support/screenshot-source-factory';
import { emitVisualTelemetry } from '@plugins/visual/support/visual-telemetry';
import { VisualCaptureResult } from '@plugins/visual/support/visual-result.types';

export const CaptureSnapshotAction: ActionHandler<VisualActionContext> = {
    name: 'CAPTURE_SNAPSHOT',
    async execute(ctx) {
        const opts = parseVisualTarget(ctx.target);
        const snapshot = VisualContractLoader.getSnapshot(opts.feature, opts.snapshotId);
        const resolved = resolveVisualTarget(snapshot, { strict: false });

        const startedAt = Date.now();
        const paths = resultPaths({
            feature: opts.feature,
            snapshotId: opts.snapshotId,
            platform: opts.platform,
            viewport: opts.viewport,
        });
        ensureDir(paths.runResultDir);

        let actualPath: string | null = null;
        let status: VisualCaptureResult['status'] = 'PASS';
        let errorMessage: string | null = null;

        try {
            const source = ctx.screenshotSource ?? resolveScreenshotSource(opts.platform);
            const png = await source.capture({
                platform: opts.platform,
                viewport: opts.viewport,
                sessionId: ctx.sessionId,
                regionSelector: resolved.resolvedRegion ?? undefined,
                maskSelectors: resolved.resolvedMasks,
                metadata: ctx.metadata,
            });
            writeFileSync(paths.actualPath, png);
            actualPath = paths.actualPath;
        } catch (err) {
            status = 'FAIL';
            errorMessage = (err as Error).message;
        }

        const durationMs = Date.now() - startedAt;

        if (snapshot.telemetry?.enabled !== false) {
            await emitVisualTelemetry({
                feature: opts.feature,
                snapshotId: opts.snapshotId,
                regionRef: snapshot.regionRef,
                resolvedRegionStrategy: resolved.resolvedRegionStrategy,
                maskRefs: snapshot.maskRefs ?? [],
                resolvedMaskCount: resolved.resolvedMasks.length,
                platform: opts.platform,
                viewport: opts.viewport,
                status,
                durationMs,
                baselinePath: null,
                actualPath,
                diffPath: null,
                diffPixels: null,
                diffRatio: null,
                threshold: null,
                passed: null,
                errorMessage,
                metadata: { action: 'CAPTURE_SNAPSHOT', sessionId: ctx.sessionId },
            });
        }

        if (status === 'FAIL') {
            throw new Error(`[CAPTURE_SNAPSHOT] ${opts.feature}/${opts.snapshotId}: ${errorMessage}`);
        }

        const result: VisualCaptureResult = {
            feature: opts.feature,
            snapshotId: opts.snapshotId,
            regionRef: snapshot.regionRef,
            resolvedRegion: resolved.resolvedRegion,
            platform: opts.platform,
            viewport: opts.viewport,
            status,
            durationMs,
            actualPath,
            errorMessage,
        };
        return JSON.stringify(result);
    },
};
