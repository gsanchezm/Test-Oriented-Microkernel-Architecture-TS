#!/usr/bin/env node
// Reads reports/playwright.json and reports/api.json and prints one line
// per failing scenario with: feature :: scenario :: error_first_line.
// Used by the triage step — categorize each failure into:
//   (a) framework / test-infra / concurrent-pollution
//   (b) missing app feature
//   (c) legit OmniPizza bug

const fs = require('fs');

function loadFails(path) {
    if (!fs.existsSync(path)) return [];
    const data = JSON.parse(fs.readFileSync(path, 'utf8'));
    const out = [];
    for (const feature of data) {
        for (const scenario of feature.elements || []) {
            if (scenario.type !== 'scenario') continue;
            const failedSteps = scenario.steps.filter(
                (s) => s.result && s.result.status === 'failed'
            );
            if (!failedSteps.length) continue;
            for (const step of failedSteps) {
                const err = (step.result.error_message || '').split('\n')[0].slice(0, 220);
                out.push({
                    feature: feature.uri,
                    scenario: scenario.name,
                    step: step.keyword.trim() + ' ' + step.name,
                    error: err,
                });
            }
        }
    }
    return out;
}

const pw = loadFails('reports/playwright.json');
const api = loadFails('reports/api.json');

console.log(`PLAYWRIGHT FAILURES (${pw.length}):\n`);
for (const f of pw) {
    console.log(`  [${f.feature.split('\\').slice(-2).join('/')}]`);
    console.log(`    Scenario: ${f.scenario}`);
    console.log(`    Step:     ${f.step}`);
    console.log(`    Error:    ${f.error}`);
    console.log();
}

console.log(`\nAPI FAILURES (${api.length}):`);
for (const f of api) {
    console.log(`  ${f.feature} :: ${f.scenario} :: ${f.error}`);
}
