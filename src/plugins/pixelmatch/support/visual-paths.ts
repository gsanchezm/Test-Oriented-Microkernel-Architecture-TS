// Deterministic path helpers for the Visual oracle.
//
// Layout (market segment is optional — present for scenario-bound
// snapshots whose render depends on per-market data, omitted when the
// snapshot is market-agnostic):
//   visual-baselines/<feature>/<snapshot-id>/<platform>/<viewport>[/<market>]/baseline.png
//   visual-results/<run-id>/<feature>/<snapshot-id>/<platform>/<viewport>[/<market>]/{actual,diff}.png + result.json
//
// runId precedence mirrors ContractTelemetryWriter: TOM_RUN_ID → GITHUB_RUN_ID → generated.

import { mkdirSync } from 'fs';
import { join, resolve } from 'path';
import { resolveRunId } from '@core/contracts/contract-telemetry-writer';

const REPO_ROOT = resolve(__dirname, '../../../..');

export interface VisualPathKey {
    feature: string;
    snapshotId: string;
    platform: string;
    viewport: string;
    /** Optional scenario-data dimension (e.g. country code "US"/"MX"). */
    market?: string;
}

function marketSegment(market: string | undefined): string[] {
    return market ? [market.toLowerCase()] : [];
}

export interface VisualBaselinePaths {
    baselineDir: string;
    baselinePath: string;
}

export interface VisualResultPaths {
    runId: string;
    runResultDir: string;
    actualPath: string;
    diffPath: string;
    resultJsonPath: string;
}

export function baselinePaths(key: VisualPathKey): VisualBaselinePaths {
    const baselineDir = join(
        REPO_ROOT,
        'visual-baselines',
        key.feature,
        key.snapshotId,
        key.platform,
        key.viewport,
        ...marketSegment(key.market),
    );
    return {
        baselineDir,
        baselinePath: join(baselineDir, 'baseline.png'),
    };
}

export function resultPaths(key: VisualPathKey, runId?: string): VisualResultPaths {
    const id = runId ?? resolveRunId();
    const runResultDir = join(
        REPO_ROOT,
        'visual-results',
        id,
        key.feature,
        key.snapshotId,
        key.platform,
        key.viewport,
        ...marketSegment(key.market),
    );
    return {
        runId: id,
        runResultDir,
        actualPath: join(runResultDir, 'actual.png'),
        diffPath: join(runResultDir, 'diff.png'),
        resultJsonPath: join(runResultDir, 'result.json'),
    };
}

export function ensureDir(dir: string): void {
    mkdirSync(dir, { recursive: true });
}
