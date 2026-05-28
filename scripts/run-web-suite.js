#!/usr/bin/env node
// Cross-platform launcher for the per-viewport Playwright web suites.
//
// Why this exists: npm scripts that pass single-quoted cucumber tags
// (e.g. --tags '@desktop') silently run 0 scenarios under cmd.exe on
// Windows because the quotes are not stripped. Spawning cucumber-js from
// Node with an argv ARRAY and shell:false sidesteps all shell quoting, so
// the tag arrives intact on every platform.
//
// Usage:
//   node scripts/run-web-suite.js <viewport>     viewport ∈ {desktop, responsive}
//
// Output:
//   reports/playwright-<viewport>-<browser>.json
//   where <browser> comes from the BROWSER env var (default chromium).
//
// The repo's cucumber.js config wires up ts-node + tsconfig-paths + dotenv
// via requireModule, so no requireModule needs to be passed here.

const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

const VIEWPORT_TAGS = {
    desktop: '@desktop',
    responsive: '@responsive',
};

const viewport = (process.argv[2] || '').trim().toLowerCase();
const tag = VIEWPORT_TAGS[viewport];

if (!tag) {
    console.error(
        `run-web-suite: invalid or missing viewport "${process.argv[2] || ''}". ` +
            `Expected one of: ${Object.keys(VIEWPORT_TAGS).join(', ')}.`
    );
    process.exit(2);
}

const browser = (process.env.BROWSER || 'chromium').trim().toLowerCase();
const outPath = path.join('reports', `playwright-${viewport}-${browser}.json`);

// Resolve the cucumber CLI entry. The documented path is the package's bin
// script; fall back to require.resolve so an atypical install layout still works.
let cucumberBin = path.join(
    process.cwd(),
    'node_modules',
    '@cucumber',
    'cucumber',
    'bin',
    'cucumber.js'
);
if (!fs.existsSync(cucumberBin)) {
    try {
        cucumberBin = require.resolve('@cucumber/cucumber/bin/cucumber.js');
    } catch {
        console.error(
            `run-web-suite: could not locate cucumber CLI at ${cucumberBin}. ` +
                `Is @cucumber/cucumber installed?`
        );
        process.exit(1);
    }
}

const child = spawn(
    process.execPath,
    [cucumberBin, '--tags', tag, '--format', 'json:' + outPath],
    {
        stdio: 'inherit',
        shell: false,
        env: { ...process.env, PLUGIN_PIXELMATCH: 'false' },
    }
);

child.on('error', (err) => {
    console.error(`run-web-suite: failed to spawn cucumber-js: ${err.message}`);
    process.exit(1);
});

child.on('exit', (code, signal) => {
    if (signal) {
        // Re-raise the signal so the parent's exit status reflects it.
        process.kill(process.pid, signal);
        return;
    }
    process.exit(code == null ? 1 : code);
});
