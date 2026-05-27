const fs = require('fs');

/**
 * Loads and summarizes Cucumber JSON reports.
 *
 * @param {string|string[]} filePathOrPaths - Either a single cucumber JSON
 *   path (legacy single-file callers) OR an array of paths whose summaries
 *   are merged into one. The array form is used by the split CI flow where
 *   `playwright-desktop.json` and `playwright-responsive.json` are written
 *   by separate jobs and need to roll up into a single "Playwright" section
 *   in the HTML report. Missing paths are silently skipped — caller can
 *   pass every candidate path and only the ones present contribute.
 * @param {string} platform - The platform name (e.g. android, ios, desktop, api)
 * @returns {object} Summary object: { available, platform, status, features,
 *                                     total, passed, failed, skipped,
 *                                     durationNs, errorGroups }
 */
function loadCucumber(filePathOrPaths, platform) {
    const empty = () => emptyOf(platform);

    // Normalize input. Legacy callers pass a string; the build orchestrator
    // can pass an array now. We filter to existing paths up front so callers
    // can pass every candidate without checking presence themselves.
    const candidatePaths = Array.isArray(filePathOrPaths)
        ? filePathOrPaths
        : [filePathOrPaths];
    const paths = candidatePaths.filter((p) => p && fs.existsSync(p));

    if (paths.length === 0) return empty();
    if (paths.length === 1) return loadOne(paths[0], platform);
    return mergeSummaries(paths.map((p) => loadOne(p, platform)), platform);
}

function emptyOf(platform) {
    return {
        available: false,
        platform,
        status: 'NOT_RUN',
        features: [],
        total: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
        durationNs: 0,
        errorGroups: [],
    };
}

function loadOne(filePath, platform) {
    let rawData;
    try {
        rawData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (e) {
        return emptyOf(platform);
    }
    if (!Array.isArray(rawData)) return emptyOf(platform);

    let total = 0;
    let passed = 0;
    let failed = 0;
    let skipped = 0;
    let durationNs = 0;

    // message -> { count, scenarios: Set<string> }
    const errorMap = new Map();

    const features = rawData.map((f) => {
        const elements = f.elements || [];
        const scenarios = elements
            .filter((e) => e.type === 'scenario' || e.keyword === 'Scenario' || e.keyword === 'Scenario Outline')
            .map((s) => {
                const steps = s.steps || [];
                const stepStatuses = steps.map((st) => st.result?.status ?? 'unknown');
                const stepDuration = steps.reduce((acc, st) => acc + (st.result?.duration ?? 0), 0);

                let status;
                if (stepStatuses.some((x) => x === 'failed')) {
                    status = 'failed';
                } else if (stepStatuses.every((x) => x === 'passed') && stepStatuses.length > 0) {
                    status = 'passed';
                } else {
                    status = 'skipped';
                }

                total++;
                if (status === 'passed') passed++;
                else if (status === 'failed') failed++;
                else skipped++;

                durationNs += stepDuration;

                steps.forEach((st) => {
                    if (st.result?.status === 'failed') {
                        const rawMsg = st.result?.error_message || '';
                        const firstLine = rawMsg.split('\n')[0].trim() || 'Unknown error';
                        const scenarioName = s.name || 'Unnamed Scenario';
                        if (!errorMap.has(firstLine)) {
                            errorMap.set(firstLine, { count: 0, scenarios: new Set() });
                        }
                        const entry = errorMap.get(firstLine);
                        entry.count++;
                        entry.scenarios.add(scenarioName);
                    }
                });

                const failedStep = steps.find((st) => st.result?.status === 'failed');

                return {
                    name: s.name,
                    tags: (s.tags || []).map((t) => t.name),
                    status,
                    durationNs: stepDuration,
                    error: failedStep
                        ? {
                              step: failedStep.name,
                              message: (failedStep.result?.error_message || '').split('\n')[0].trim() || 'Unknown error',
                          }
                        : null,
                    steps: steps.map((st) => ({
                        name: st.name,
                        keyword: (st.keyword || '').trim(),
                        status: st.result?.status ?? 'unknown',
                        durationNs: st.result?.duration ?? 0,
                    })),
                };
            });

        const featurePassed = scenarios.filter((s) => s.status === 'passed').length;
        const featureFailed = scenarios.filter((s) => s.status === 'failed').length;

        return {
            uri: f.uri,
            name: f.name,
            scenarios,
            passed: featurePassed,
            failed: featureFailed,
            total: scenarios.length,
        };
    });

    const errorGroups = Array.from(errorMap.entries()).map(([message, data]) => ({
        message,
        count: data.count,
        scenarios: Array.from(data.scenarios),
    }));

    return {
        available: true,
        platform,
        status: failed > 0 ? 'FAIL' : (passed > 0 ? 'PASS' : 'NOT_RUN'),
        features,
        total,
        passed,
        failed,
        skipped,
        durationNs,
        errorGroups,
    };
}

/**
 * Merges multiple cucumber summaries (one per JSON file) into a single
 * summary. Concatenates features verbatim (assumes the input files describe
 * non-overlapping scenarios — true for the split CI flow where desktop and
 * responsive jobs cover different viewport tags). Sums totals + durations.
 * Merges errorGroups by message so the same recurring error across viewports
 * surfaces as one group with the union of affected scenarios.
 */
function mergeSummaries(summaries, platform) {
    const features = summaries.flatMap((s) => s.features);
    const total      = summaries.reduce((a, s) => a + s.total,      0);
    const passed     = summaries.reduce((a, s) => a + s.passed,     0);
    const failed     = summaries.reduce((a, s) => a + s.failed,     0);
    const skipped    = summaries.reduce((a, s) => a + s.skipped,    0);
    const durationNs = summaries.reduce((a, s) => a + s.durationNs, 0);

    const errorMap = new Map();
    for (const s of summaries) {
        for (const eg of s.errorGroups) {
            if (!errorMap.has(eg.message)) {
                errorMap.set(eg.message, { count: 0, scenarios: new Set() });
            }
            const entry = errorMap.get(eg.message);
            entry.count += eg.count;
            eg.scenarios.forEach((sc) => entry.scenarios.add(sc));
        }
    }
    const errorGroups = Array.from(errorMap.entries()).map(([message, data]) => ({
        message,
        count: data.count,
        scenarios: Array.from(data.scenarios),
    }));

    return {
        available: true,
        platform,
        status: failed > 0 ? 'FAIL' : (passed > 0 ? 'PASS' : 'NOT_RUN'),
        features,
        total,
        passed,
        failed,
        skipped,
        durationNs,
        errorGroups,
    };
}

module.exports = { loadCucumber };
