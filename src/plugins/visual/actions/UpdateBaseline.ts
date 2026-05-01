// UPDATE_BASELINE — capture a fresh actual.png and overwrite the
// baseline. Always intentional, regardless of VISUAL_UPDATE_BASELINE.
// Emits a telemetry event with status=PASS and metadata.action=
// 'UPDATE_BASELINE' so the research dataset can distinguish bootstrap
// runs from real comparison runs.

import { writeFileSync } from 'fs';
import { ActionHandler } from '@plugins/shared/ActionHandler';
import { VisualActionContext } from '@plugins/visual/actions/VisualActionContext';
import { parseVisualTarget } from '@plugins/visual/actions/visual-target-options';
import { VisualContractLoader } from '@core/contracts/visual-contract-loader';
import { resolveVisualTarget } from '@core/contracts/visual-target-resolver';
import { resultPaths, ensureDir, VisualPathKey } from '@plugins/visual/support/visual-paths';
import { writeBaselineFromBuffer } from '@plugins/visual/support/visual-baseline-policy';
import { resolveScreenshotSource } from '@plugins/visual/support/screenshot-source-factory';
import { emitVisualTelemetry } from '@plugins/visual/support/visual-telemetry';

export const UpdateBaselineAction: ActionHandler<VisualActionContext> = {
    name: 'UPDATE_BASELINE',
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

        const startedAt = Date.now();
        const paths = resultPaths(key);
        ensureDir(paths.runResultDir);

        let actualPath: string | null = null;
        let baselinePath: string | null = null;
        let status: 'PASS' | 'FAIL' = 'PASS';
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
            baselinePath = writeBaselineFromBuffer(key, png);
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
                baselinePath,
                actualPath,
                diffPath: null,
                diffPixels: null,
                diffRatio: null,
                threshold: null,
                passed: null,
                errorMessage,
                metadata: {
                    action: 'UPDATE_BASELINE',
                    sessionId: ctx.sessionId,
                    baselineCreated: status === 'PASS',
                    updateReason: opts.updateReason,
                },
            });
        }

        if (status === 'FAIL') {
            throw new Error(`[UPDATE_BASELINE] ${opts.feature}/${opts.snapshotId}: ${errorMessage}`);
        }

        return JSON.stringify({
            feature: opts.feature,
            snapshotId: opts.snapshotId,
            platform: opts.platform,
            viewport: opts.viewport,
            actualPath,
            baselinePath,
            status,
            durationMs,
            updateReason: opts.updateReason,
        });
    },
};
