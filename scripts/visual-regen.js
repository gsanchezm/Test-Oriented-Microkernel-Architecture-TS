#!/usr/bin/env node
/**
 * Per-viewport visual baseline regeneration (local iteration mode).
 *
 * "Auto-regen each run" model: locally, every visual execution regenerates
 * its OWN viewport's baselines so the run is green by construction (the local
 * suite is for iteration, NOT a regression gate). The real regression gate is
 * CI (the `update-visual-baselines.yml` workflow produces the canonical Linux
 * baselines; the e2e visual gate COMPARES against them without this flag).
 *
 * Why a dedicated script instead of `visual:refresh`:
 *   - `VISUAL_UPDATE_BASELINE=true` only CREATES missing baselines; it never
 *     overwrites an existing one (see visual-baseline-policy.ts). So to truly
 *     regenerate, the matching baselines must be deleted first.
 *   - `visual:refresh` wipes ALL of visual-baselines/, so regenerating the
 *     desktop viewport would destroy the responsive baselines (and vice-versa).
 *     This script wipes ONLY the current viewport's subtrees, so running it for
 *     desktop and then responsive accumulates both.
 *
 * The viewport must match the running plugin's VIEWPORT (set in .env at plugin
 * start). Pass the viewport as argv[2] (or REGEN_VIEWPORT env); the cucumber
 * tag filter (@<viewport> and @visual) is derived from it.
 *
 * Usage (plugin must already be running at the matching VIEWPORT):
 *   node scripts/visual-regen.js desktop
 *   node scripts/visual-regen.js responsive
 */
const { spawn } = require('child_process');
const { rmSync, readdirSync, existsSync } = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const BASELINE_DIR = path.join(ROOT, 'visual-baselines');

const viewport = (process.argv[2] || process.env.REGEN_VIEWPORT || 'desktop').toLowerCase();
if (!['desktop', 'responsive', 'mobile'].includes(viewport)) {
    console.error(`[visual:regen] invalid viewport "${viewport}" (expected desktop|responsive|mobile)`);
    process.exit(1);
}

// Wipe ONLY this viewport's baseline subtrees: visual-baselines/<feature>/<snapshotId>/<platform>/<viewport>/
let wiped = 0;
function wipeViewport(dir) {
    if (!existsSync(dir)) return;
    for (const feature of readdirSync(dir, { withFileTypes: true })) {
        if (!feature.isDirectory()) continue;
        const featDir = path.join(dir, feature.name);
        for (const snap of readdirSync(featDir, { withFileTypes: true })) {
            if (!snap.isDirectory()) continue;
            const snapDir = path.join(featDir, snap.name);
            for (const platform of readdirSync(snapDir, { withFileTypes: true })) {
                if (!platform.isDirectory()) continue;
                const target = path.join(snapDir, platform.name, viewport);
                if (existsSync(target)) {
                    rmSync(target, { recursive: true, force: true });
                    wiped++;
                }
            }
        }
    }
}

console.log(`[visual:regen] viewport=${viewport} — wiping only this viewport's baselines under ${BASELINE_DIR}`);
wipeViewport(BASELINE_DIR);
console.log(`[visual:regen] wiped ${wiped} <platform>/${viewport} baseline subtree(s). Other viewports untouched.`);
console.log(`[visual:regen] running @${viewport} and @visual with VISUAL_UPDATE_BASELINE=true (green by construction).`);
console.log(`[visual:regen] NOTE: local iteration only — the regression gate is CI's update-visual-baselines.yml.\n`);

const cucumberBin = process.platform === 'win32'
    ? path.join(ROOT, 'node_modules', '.bin', 'cucumber-js.cmd')
    : path.join(ROOT, 'node_modules', '.bin', 'cucumber-js');

if (!existsSync(cucumberBin)) {
    console.error(`[visual:regen] cucumber-js not found at ${cucumberBin}. Run \`pnpm install\` first.`);
    process.exit(1);
}

// Build a single shell command so the multi-word tag expression
// ("@<viewport> and @visual") stays a single quoted argument. Passing it as an
// array element with shell:true on Windows splits on spaces and cucumber then
// treats "@visual" as a path (ENOENT). A quoted string command avoids that.
const cmd = `"${cucumberBin}" --tags "@${viewport} and @visual" --format json:reports/playwright-visual-${viewport}.json`;
const child = spawn(cmd, {
    stdio: 'inherit',
    cwd: ROOT,
    env: { ...process.env, VISUAL_UPDATE_BASELINE: 'true', PLUGIN_PIXELMATCH: 'true' },
    shell: true,
});

child.on('exit', (code) => {
    if (code === 0) {
        console.log(`\n[visual:regen] ${viewport} baselines regenerated. Inspect visual-baselines/**/${viewport}/ before shipping via the CI workflow.`);
    } else {
        console.error(`\n[visual:regen] cucumber exited ${code}.`);
    }
    process.exit(code ?? 0);
});
