#!/usr/bin/env node
/**
 * Visual gate.
 *
 * Walks `visual-results/<runId>/...` and exits non-zero if any `result.json`
 * has `status: "FAIL"`. Designed to run as the final step of a CI job that
 * already produced visual captures via `PLUGIN_PIXELMATCH=true`. The
 * cucumber visual hook itself swallows COMPARE_SNAPSHOT errors (so a drift
 * does not corrupt the functional pass/fail signal), but the gate makes
 * the drift visible as a separate, explicit CI failure.
 *
 * Exit codes:
 *   0 — no drift (every snapshot PASS or no snapshots at all)
 *   1 — at least one snapshot in `FAIL` status
 *   2 — script error (unexpected)
 *
 * Stdout format is plain text suitable for CI log readers; structured
 * details land in the `visual-results/` artifact.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const RESULTS_DIR = path.join(ROOT, 'visual-results');

function walk(dir) {
    if (!fs.existsSync(dir)) return [];
    const out = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, entry.name);
        if (entry.isDirectory()) out.push(...walk(p));
        else if (entry.name === 'result.json') out.push(p);
    }
    return out;
}

function keyOf(r) {
    return [r.feature, r.snapshotId, r.platform, r.viewport, r.market, r.language]
        .filter(Boolean)
        .join('/');
}

function detailOf(r) {
    if (r.errorMessage) return r.errorMessage;
    const px = r.diffPixels ?? 0;
    const ratio = ((r.diffRatio ?? 0) * 100).toFixed(3);
    return `diff=${px}px (${ratio}%)`;
}

try {
    const files = walk(RESULTS_DIR);
    const passed = [];
    const failed = [];
    let bootstrapped = 0;

    for (const f of files) {
        let r;
        try {
            r = JSON.parse(fs.readFileSync(f, 'utf8'));
        } catch {
            continue;
        }
        if (r.status === 'FAIL') failed.push(r);
        else if (r.status === 'PASS') passed.push(r);
        if (r.baselineCreated) bootstrapped++;
    }

    console.log(
        `[visual-gate] ${passed.length} pass · ${failed.length} fail · ${bootstrapped} bootstrapped (${files.length} total snapshots).`
    );

    if (failed.length === 0) {
        console.log('[visual-gate] OK — no visual drift detected.');
        process.exit(0);
    }

    console.log('[visual-gate] Drift detected on the following snapshots:');
    for (const r of failed) {
        console.log(`  ✕ ${keyOf(r)} — ${detailOf(r)}`);
    }
    console.log('');
    console.log('[visual-gate] Inspect the `visual-results/` artifact for actual/baseline/diff PNGs.');
    console.log('[visual-gate] If the changes are intentional, regenerate baselines via the');
    console.log('[visual-gate] `update-visual-baselines.yml` workflow with a reason describing why.');
    process.exit(1);
} catch (err) {
    console.error('[visual-gate] Unexpected error:', err);
    process.exit(2);
}
