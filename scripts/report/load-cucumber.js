const fs = require('fs');

/**
 * Loads and summarizes Cucumber JSON reports.
 *
 * @param {string} filePath - Path to the cucumber JSON file
 * @param {string} platform - The platform name (e.g. android, ios, desktop, api)
 * @returns {object} Summary object: { available, platform, status, features,
 *                                     total, passed, failed, skipped,
 *                                     durationNs, errorGroups }
 */
function loadCucumber(filePath, platform) {
    const empty = () => ({
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
    });

    if (!filePath || !fs.existsSync(filePath)) return empty();

    let rawData;
    try {
        rawData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (e) {
        return empty();
    }
    if (!Array.isArray(rawData)) return empty();

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

module.exports = { loadCucumber };
