const fs = require('fs');
const path = require('path');

/**
 * Walks `visual-results/<runId>/.../result.json` and aggregates Pixelmatch
 * verdicts into a flat list suitable for HTML rendering.
 *
 * Each result.json carries:
 *   { status: 'PASS' | 'FAIL', baselineCreated: bool, feature, snapshotId,
 *     platform, viewport, market?, language?, diffPixels?, diffRatio?,
 *     errorMessage? }
 *
 * @param {string} dir - Absolute path to `visual-results/`.
 * @returns {object} Summary: { available, results, runIds, total, pass, fail,
 *                              verified, bootstrapped }
 */
function loadVisual(dir) {
    const empty = () => ({
        available: false,
        results: [],
        runIds: [],
        total: 0,
        pass: 0,
        fail: 0,
        verified: 0,
        bootstrapped: 0,
    });

    if (!dir || !fs.existsSync(dir)) return empty();

    const files = walkResultJsons(dir);
    if (files.length === 0) return empty();

    const results = [];
    const runIdSet = new Set();

    for (const f of files) {
        try {
            const r = JSON.parse(fs.readFileSync(f, 'utf8'));
            const m = f.match(/[\\/]visual-results[\\/]([^\\/]+)[\\/]/);
            const runId = m ? m[1] : 'unknown';
            runIdSet.add(runId);
            results.push({ ...r, runId, resultPath: f });
        } catch {
            // ignore malformed json
        }
    }

    // Stable display order: feature → snapshotId → market → platform
    results.sort((a, b) =>
        String(a.feature || '').localeCompare(String(b.feature || '')) ||
        String(a.snapshotId || '').localeCompare(String(b.snapshotId || '')) ||
        String(a.market || '').localeCompare(String(b.market || '')) ||
        String(a.platform || '').localeCompare(String(b.platform || '')),
    );

    let pass = 0;
    let fail = 0;
    let bootstrapped = 0;
    let verified = 0;
    for (const r of results) {
        if (r.status === 'PASS') pass++;
        else fail++;
        if (r.baselineCreated) bootstrapped++;
        else if (r.status === 'PASS') verified++;
    }

    return {
        available: true,
        results,
        runIds: [...runIdSet],
        total: results.length,
        pass,
        fail,
        verified,
        bootstrapped,
    };
}

function walkResultJsons(dir) {
    const out = [];
    let entries;
    try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
        return out;
    }
    for (const e of entries) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) out.push(...walkResultJsons(p));
        else if (e.name === 'result.json') out.push(p);
    }
    return out;
}

module.exports = { loadVisual };
