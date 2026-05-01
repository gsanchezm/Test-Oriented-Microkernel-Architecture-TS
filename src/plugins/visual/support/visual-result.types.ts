// Result types for Visual plugin actions. The plugin returns a JSON string
// over gRPC; these types describe its shape so consumers can parse safely.

export type VisualStatus = 'PASS' | 'FAIL' | 'SKIP' | 'UNKNOWN';

export interface VisualImageDimensions {
    width: number;
    height: number;
}

export interface VisualThresholdsApplied {
    maxDiffPixels: number;
    maxDiffRatio: number;
}

export interface VisualComparisonResult {
    feature: string;
    snapshotId: string;
    regionRef: string;
    resolvedRegion: string | null;
    resolvedRegionStrategy: string | null;
    maskRefs: string[];
    resolvedMaskCount: number;
    platform: string;
    viewport: string;
    status: VisualStatus;
    durationMs: number;
    baselinePath: string | null;
    actualPath: string | null;
    diffPath: string | null;
    diffPixels: number | null;
    totalPixels: number | null;
    diffRatio: number | null;
    threshold: VisualThresholdsApplied;
    passed: boolean | null;
    baselineCreated: boolean;
    errorMessage: string | null;
}

export interface VisualCaptureResult {
    feature: string;
    snapshotId: string;
    regionRef: string;
    resolvedRegion: string | null;
    platform: string;
    viewport: string;
    status: VisualStatus;
    durationMs: number;
    actualPath: string | null;
    errorMessage: string | null;
}

export interface VisualValidationResult {
    feature: string;
    version: string;
    snapshotCount: number;
    snapshots: Array<{
        id: string;
        regionRef: string;
        regionResolved: boolean;
        maskRefs: string[];
        masksResolved: number;
        masksUnresolved: string[];
    }>;
    unresolvedRefs: string[];
}
