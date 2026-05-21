// Deterministic path helpers for the Visual oracle.
//
// Layout (the market and language segments are optional — present for
// scenario-bound snapshots whose render depends on per-market or
// per-language data, omitted when the snapshot is invariant in that
// dimension):
//   visual-baselines/<feature>/<snapshot-id>/<platform>/<viewport>[/<market>][/<language>]/baseline.png
//   visual-results/<run-id>/<feature>/<snapshot-id>/<platform>/<viewport>[/<market>][/<language>]/{actual,diff}.png + result.json
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
    /** Optional rendering-language dimension ("en"/"es"/"de"/"fr"/"ja").
     *  Needed when a single market shows multiple languages (CH-de vs CH-fr)
     *  or when login screens render different copy per locale before the
     *  market context is established. */
    language?: string;
}

function marketSegment(market: string | undefined): string[] {
    return market ? [market.toLowerCase()] : [];
}

function languageSegment(language: string | undefined): string[] {
    return language ? [language.toLowerCase()] : [];
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
        ...languageSegment(key.language),
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
        ...languageSegment(key.language),
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
