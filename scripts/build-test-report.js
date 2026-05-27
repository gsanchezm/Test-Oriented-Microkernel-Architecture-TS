#!/usr/bin/env node
// Modular HTML test report builder orchestrator.
//
// Reads:
//   reports/api.json
//   reports/playwright.json
//   reports/android.json
//   reports/ios.json
//   Gatling logs from CLI args (see usage below) or auto-discovered under
//     target/gatling/ and metrics/raw/gatling/
//   visual-results/ for Pixelmatch logs
//
// Writes:
//   reports/test-report.html (single-file AHM dashboard)
//
// Usage:
//   node scripts/build-test-report.js [POSITIONAL] [--gatling-<short>=<path> ...]
//
//   Named flags (preferred):
//     --gatling-checkout=<path>      → checkout-load
//     --gatling-login=<path>         → invalid-login-load
//     --gatling-order-success=<path> → order-success-load
//     --gatling-catalog=<path>       → catalog-load
//     --gatling-builder=<path>       → pizzaBuilder-load
//     --gatling-profile=<path>       → profile-load
//
//   Positional fallback (legacy, first three args only):
//     argv[2] → checkout-load
//     argv[3] → invalid-login-load
//     argv[4] → order-success-load
//   The new sims (catalog/builder/profile) cannot be passed positionally —
//   use the named flags so labels don't get mismatched.

const fs = require('fs');
const path = require('path');
const { loadCucumber } = require('./report/load-cucumber');
const { loadGatling, KNOWN_SIMS } = require('./report/load-gatling');
const { loadVisual } = require('./report/load-visual');
const { renderHtml } = require('./report/render-html');

const REPO = process.cwd();
const REPORTS_DIR = path.join(REPO, 'reports');
const OUT = path.join(REPORTS_DIR, 'test-report.html');
const VISUAL_RESULTS_DIR = path.join(REPO, 'visual-results');

if (!fs.existsSync(REPORTS_DIR)) {
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
}

// 1. Load Cucumber data
//
// Playwright source precedence: prefer the per-viewport split files written
// by `test:json:web:desktop` + `test:json:web:responsive` (the CI's e2e-web /
// e2e-web-responsive jobs). Fall back to the legacy single `playwright.json`
// only when no split file is present — never merge both, otherwise scenarios
// double-count.
const playwright = loadCucumber(resolvePlaywrightPaths(), 'playwright');
const api = loadCucumber(path.join(REPORTS_DIR, 'api.json'), 'api');
const android = loadCucumber(path.join(REPORTS_DIR, 'android.json'), 'android');
const ios = loadCucumber(path.join(REPORTS_DIR, 'ios.json'), 'ios');

function resolvePlaywrightPaths() {
    const split = ['playwright-desktop.json', 'playwright-responsive.json']
        .map((name) => path.join(REPORTS_DIR, name))
        .filter((p) => fs.existsSync(p));
    if (split.length > 0) return split;
    return [path.join(REPORTS_DIR, 'playwright.json')];
}

// 2. Load Gatling performance data
const gatlingArgs = process.argv.slice(2);
const gatling = loadGatling(gatlingArgs);

// 3. Load Visual Pixelmatch data
const visual = loadVisual(VISUAL_RESULTS_DIR);

// 4. Render HTML template
const data = {
    playwright,
    api,
    android,
    ios,
    gatling,
    visual
};

const html = renderHtml(data);

// 5. Write output
fs.writeFileSync(OUT, html);

console.log(`Report written: ${OUT}`);
console.log(`  Playwright: ${playwright.available ? `${playwright.passed}/${playwright.total}` : 'Not Run'}`);
console.log(`  API:        ${api.available ? `${api.passed}/${api.total}` : 'Not Run'}`);
console.log(`  Android:    ${android.available ? `${android.passed}/${android.total}` : 'Not Run'}`);
console.log(`  iOS:        ${ios.available ? `${ios.passed}/${ios.total}` : 'Not Run'}`);

// Compact one-line-per-sim status so a six-sim run still fits the terminal.
const gatlingLine = KNOWN_SIMS
    .map((name) => {
        const sim = gatling[name];
        if (!sim || !sim.available) return `${name}: —`;
        const flag = sim.ko === 0 ? '' : ` (${sim.ko} KO)`;
        return `${name}: ${sim.ok}/${sim.total}${flag}`;
    })
    .join(' · ');
console.log(`  Gatling:    ${gatlingLine}`);
console.log(`  Visual:     ${visual.available ? `${visual.verified} verified · ${visual.bootstrapped} baselined · ${visual.fail} drift (${visual.total} total)` : 'Not Run'}`);
