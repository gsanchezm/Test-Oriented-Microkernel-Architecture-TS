#!/usr/bin/env node
/**
 * Local visual baseline refresh.
 *
 * Wipes `visual-baselines/` and runs the @visual cucumber tag with
 * VISUAL_UPDATE_BASELINE=true + PLUGIN_PIXELMATCH=true so the first
 * capture of each (feature, snapshotId, platform, viewport, market,
 * language) bucket becomes the new baseline.
 *
 * NOTE: this is for local iteration only. The canonical baselines that
 * gate PRs come from the `update-visual-baselines.yml` GitHub workflow
 * (Linux container with pinned Chromium + fonts). Committing baselines
 * generated on a developer laptop will introduce font-rendering drift
 * against the CI environment.
 *
 * Usage:
 *   pnpm visual:refresh
 *   node scripts/visual-refresh.js
 */

const { spawn } = require('child_process');
const { rmSync, existsSync, mkdirSync } = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const BASELINE_DIR = path.join(ROOT, 'visual-baselines');

console.log('[visual:refresh] Wiping ' + BASELINE_DIR);
rmSync(BASELINE_DIR, { recursive: true, force: true });
mkdirSync(BASELINE_DIR, { recursive: true });

console.log('[visual:refresh] Running cucumber @visual with VISUAL_UPDATE_BASELINE=true');
console.log('[visual:refresh] Reminder: these are LOCAL baselines. Use the GitHub workflow');
console.log('[visual:refresh] "update-visual-baselines.yml" for the baselines that ship to CI.\n');

const cucumberBin = process.platform === 'win32'
    ? path.join(ROOT, 'node_modules', '.bin', 'cucumber-js.cmd')
    : path.join(ROOT, 'node_modules', '.bin', 'cucumber-js');

if (!existsSync(cucumberBin)) {
    console.error('[visual:refresh] cucumber-js not found at ' + cucumberBin + '. Run `pnpm install` first.');
    process.exit(1);
}

const env = {
    ...process.env,
    VISUAL_UPDATE_BASELINE: 'true',
    PLUGIN_PIXELMATCH: 'true',
};

const child = spawn(cucumberBin, ['--tags', '@visual'], {
    stdio: 'inherit',
    env,
    shell: process.platform === 'win32',
});

child.on('exit', (code) => {
    if (code === 0) {
        console.log('\n[visual:refresh] Baselines regenerated. Inspect `visual-baselines/` before deciding whether to ship them via PR.');
    } else {
        console.error('\n[visual:refresh] Cucumber exited with code ' + code + '. Baselines may be incomplete.');
    }
    process.exit(code ?? 0);
});
