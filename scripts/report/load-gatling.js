const fs = require('fs');
const path = require('path');

// Known Gatling sims surfaced by the report. Order matters for the
// positional fallback (kept for backward-compat with the original
// three-arg orchestrator invocation).
const KNOWN_SIMS = [
    'checkout-load',
    'invalid-login-load',
    'order-success-load',
    'catalog-load',
    'pizzaBuilder-load',
    'profile-load',
];

// Short alias → canonical sim name, used by the `--gatling-<short>=path`
// CLI flag. The short forms keep the invocation readable in shells where
// quoting matters.
const SHORT_ALIASES = {
    'checkout':       'checkout-load',
    'login':          'invalid-login-load',
    'order-success':  'order-success-load',
    'order_success':  'order-success-load',
    'catalog':        'catalog-load',
    'builder':        'pizzaBuilder-load',
    'pizzabuilder':   'pizzaBuilder-load',
    'profile':        'profile-load',
};

// Positional fallback assignment — only the legacy three sims, matching the
// original orchestrator contract. The newer sims (catalog/builder/profile)
// require named flags so positional callers don't accidentally mislabel.
const POSITIONAL_SIMS = ['checkout-load', 'invalid-login-load', 'order-success-load'];

/**
 * Loads and summarizes Gatling performance logs.
 *
 * Input forms (mix freely):
 *   - `--gatling-<short>=<path>`      → bind <path> to the sim named by <short>
 *     (e.g. `--gatling-catalog=logs/perf-catalog.log`).
 *   - Positional path                 → consumed in legacy order
 *     `[checkout, login, order-success]`; ignored once those three are
 *     bound by named flags.
 *
 * @param {string[]} args
 * @returns {Object.<string, GatlingSummary>} map keyed by canonical sim name.
 */
function loadGatling(args) {
    const out = {};
    for (const sim of KNOWN_SIMS) out[sim] = emptySim(sim);

    const safeArgs = Array.isArray(args) ? args : [];

    // Phase 1 — named flags
    const positional = [];
    for (const raw of safeArgs) {
        const m = /^--gatling-([\w-]+)=(.+)$/.exec(raw);
        if (m) {
            const short = m[1].toLowerCase();
            const value = m[2];
            const canonical = SHORT_ALIASES[short] || (KNOWN_SIMS.includes(short) ? short : null);
            if (canonical && value && fs.existsSync(value)) {
                out[canonical] = parseLogFile(canonical, value);
            }
        } else {
            positional.push(raw);
        }
    }

    // Phase 2 — positional fallback for the legacy three only
    for (let i = 0; i < POSITIONAL_SIMS.length && i < positional.length; i++) {
        const sim = POSITIONAL_SIMS[i];
        if (out[sim].available) continue; // a named flag won this slot already
        const candidate = positional[i];
        if (candidate && fs.existsSync(candidate)) {
            out[sim] = parseLogFile(sim, candidate);
        }
    }

    // Phase 3 — best-effort auto-discovery for sims still empty.
    for (const sim of KNOWN_SIMS) {
        if (out[sim].available) continue;
        const discovered = discoverLatestSimulationLog(sim);
        if (discovered) out[sim] = parseLogFile(sim, discovered);
    }

    return out;
}

function emptySim(label) {
    return {
        label,
        available: false,
        total: 0,
        ok: 0,
        ko: 0,
        rt: { min: 0, max: 0, mean: 0, p50: 0, p75: 0, p95: 0, p99: 0 },
        throughput: 0,
        errors: [],
        requests: [],
    };
}

/**
 * Parses a Gatling stdout log file. Gatling's text summary follows a stable
 * layout (`> request count`, `> Login | total | ok | ko`, etc.) — we read
 * those numeric columns and the Errors section.
 */
function parseLogFile(label, logPath) {
    let text;
    try {
        text = fs.readFileSync(logPath, 'utf8');
    } catch (e) {
        return emptySim(label);
    }

    const pickNum = (line) => {
        if (!line) return [0, 0, 0];
        const cols = line.split('|').slice(1).map((c) => c.trim());
        const nums = cols.map((c) => (c === '-' ? 0 : Number(c)));
        return [nums[0] ?? 0, nums[1] ?? 0, nums[2] ?? 0];
    };
    const lineMatch = (re) => {
        const lines = text.split('\n');
        for (const l of lines) if (re.test(l)) return l;
        return null;
    };

    const total = pickNum(lineMatch(/request count/));
    const minRt = pickNum(lineMatch(/min response time/));
    const maxRt = pickNum(lineMatch(/max response time/));
    const meanRt = pickNum(lineMatch(/mean response time/));
    const p50 = pickNum(lineMatch(/response time 50th percentile/));
    const p75 = pickNum(lineMatch(/response time 75th percentile/));
    const p95 = pickNum(lineMatch(/response time 95th percentile/));
    const p99 = pickNum(lineMatch(/response time 99th percentile/));
    const throughput = pickNum(lineMatch(/mean throughput/));

    // Errors section
    const errors = [];
    const lines = text.split('\n');
    let inErrors = false;
    for (const l of lines) {
        if (/---- Errors -+/.test(l)) {
            inErrors = true;
            continue;
        }
        if (inErrors) {
            if (/^=+$/.test(l) || /---- /.test(l)) break;
            const m = l.match(/^>\s*(.+?)\s+(\d+)\s+\((.+?)\)/);
            if (m) errors.push({ message: m[1].trim(), count: Number(m[2]), share: m[3].trim() });
        }
    }

    // Per-request breakdown (`> Login | total | ok | ko`)
    const reqs = [];
    for (const l of lines) {
        const m = l.match(/^>\s+([\w][\w\s]*?)\s+\|\s*(\d+)\s*\|\s*(\d+)\s*\|\s*(\d+|\-)\s*$/);
        if (m && !/Global/.test(m[1])) {
            reqs.push({
                name: m[1].trim(),
                total: Number(m[2]),
                ok: Number(m[3]),
                ko: m[4] === '-' ? 0 : Number(m[4]),
            });
        }
    }

    return {
        label,
        available: true,
        total: total[0] ?? 0,
        ok: total[1] ?? 0,
        ko: total[2] ?? 0,
        rt: {
            min: minRt[0] ?? 0,
            max: maxRt[0] ?? 0,
            mean: meanRt[0] ?? 0,
            p50: p50[0] ?? 0,
            p75: p75[0] ?? 0,
            p95: p95[0] ?? 0,
            p99: p99[0] ?? 0,
        },
        throughput: throughput[0] ?? 0,
        errors,
        requests: reqs,
    };
}

/**
 * Best-effort discovery for a sim log already captured under the AHM metrics
 * pipeline. Looks for `metrics/raw/gatling/<sim>.log` and similar exact-name
 * patterns — those carry the stdout text we know how to parse. The live
 * Gatling report dir (`target/gatling/jssimulation-<ts>/simulation.log`) is
 * NOT scanned: those folders are stamped per-run-not-per-sim and contain
 * Gatling's internal binary-style log, not the stdout summary the parser
 * expects. If you want a discovery hook, capture stdout to a known path.
 */
function discoverLatestSimulationLog(sim) {
    const repo = process.cwd();
    const candidatePaths = [
        path.join(repo, 'metrics', 'raw', 'gatling', `${sim}.log`),
        path.join(repo, 'logs',  `perf-${sim}.log`),
        path.join(repo, 'logs',  `${sim}.log`),
    ];
    for (const p of candidatePaths) {
        if (fs.existsSync(p)) return p;
    }
    return null;
}

module.exports = { loadGatling, KNOWN_SIMS, SHORT_ALIASES };
