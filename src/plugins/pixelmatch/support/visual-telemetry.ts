// Visual telemetry adapter — delegates to the shared ContractTelemetryWriter
// so we don't grow a second JSONL stream. The writer already covers
// best-effort semantics (TOM_TELEMETRY_STRICT=true makes failures fatal),
// the sha256 helpers, and the metrics/raw/visual/<runId>.jsonl path.

import { ContractTelemetryWriter } from '@core/contracts/contract-telemetry-writer';
import { VisualContractTelemetryEvent } from '@core/contracts/contract-telemetry.types';

export interface EmitVisualEventInput {
    feature: string;
    snapshotId: string;
    regionRef: string;
    resolvedRegionStrategy: string | null;
    maskRefs: string[];
    resolvedMaskCount: number;
    platform: string;
    viewport: string;
    status: VisualContractTelemetryEvent['status'];
    durationMs: number | null;
    baselinePath: string | null;
    actualPath: string | null;
    diffPath: string | null;
    diffPixels: number | null;
    diffRatio: number | null;
    threshold: number | null;
    passed: boolean | null;
    errorMessage: string | null;
    metadata?: Record<string, unknown>;
}

export async function emitVisualTelemetry(input: EmitVisualEventInput): Promise<void> {
    try {
        await ContractTelemetryWriter.writeVisualEvent({
            feature: input.feature,
            contractId: `${input.feature}@${input.snapshotId}`,
            snapshotId: input.snapshotId,
            regionRef: input.regionRef,
            resolvedRegionStrategy: input.resolvedRegionStrategy,
            maskRefs: input.maskRefs,
            resolvedMaskCount: input.resolvedMaskCount,
            platform: input.platform,
            viewport: input.viewport,
            status: input.status,
            durationMs: input.durationMs,
            baselinePath: input.baselinePath,
            actualPath: input.actualPath,
            diffPath: input.diffPath,
            diffPixels: input.diffPixels,
            diffRatio: input.diffRatio,
            threshold: input.threshold,
            passed: input.passed,
            errorMessage: input.errorMessage,
            metadata: input.metadata ?? {},
        });
    } catch (err) {
        if ((process.env.TOM_TELEMETRY_STRICT || '').toLowerCase() === 'true') throw err;
        process.stderr.write(`[visual-telemetry] write failed (non-strict): ${(err as Error).message}\n`);
    }
}
