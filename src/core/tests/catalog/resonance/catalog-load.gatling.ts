// NOTE: keep relative imports — bundled by @gatling.io/cli (esbuild, no tsconfig-paths support).
/**
 * Catalog Load Simulation
 *
 * Hits `GET /api/pizzas` once per virtual user, rotating across the four
 * supported markets so each run touches every country's localized catalog
 * payload.
 *
 * Endpoint divergence (intentional):
 *   The task brief asks the simulation to hit `?country={market}`. The
 *   production OmniPizza backend reads the market from the
 *   `x-country-code` HEADER (verified via CheckoutDao.getPizzas /
 *   order-success-load.gatling.ts). The simulation sends BOTH so the
 *   load profile stays representative regardless of which dimension the
 *   API surface is reading; if the query-param contract ships, the
 *   header line is a no-op and vice versa.
 *
 * Usage:
 *   pnpm perf:smoke    →  1 user, single iteration
 *   pnpm perf:load     →  ramp to PERF_USERS over PERF_DURATION s
 *   pnpm perf:stress   →  PERF_USERS at once
 *
 * Env overrides:
 *   API_BASE_URL       Required. Where to GET /api/pizzas.
 *   LANGUAGE           X-Language header (default: en).
 *   PERF_USERS         Concurrent users for load/stress (default: 20).
 *   PERF_DURATION      Ramp duration in seconds for load profile (default: 120).
 */

import {
    simulation,
    scenario,
    atOnceUsers,
    rampUsers,
    arrayFeeder,
    jsonPath,
    getEnvironmentVariable,
    Session,
    StringBody,
} from '@gatling.io/core';
import { http } from '@gatling.io/http';

// ---------------------------------------------------------------------------
// Feeder — one row per market. Inlined (not imported from a TS data-source)
// because @gatling.io/cli bundles this file with esbuild and won't honor
// fs/path imports at runtime.
// ---------------------------------------------------------------------------

interface CatalogRow {
    market: 'US' | 'MX' | 'CH' | 'JP';
    language: string;
    // arrayFeeder() expects Record<string, unknown>[]; the index signature
    // satisfies that constraint without weakening the declared keys.
    [key: string]: unknown;
}

const CATALOG_ROWS: CatalogRow[] = [
    { market: 'US', language: 'en' },
    { market: 'MX', language: 'es' },
    { market: 'CH', language: 'de' },
    { market: 'JP', language: 'ja' },
];

const catalogFeeder = arrayFeeder(CATALOG_ROWS).circular();

// ---------------------------------------------------------------------------
// Injection profile — mirrors login-load.gatling.ts (smallest pattern).
// ---------------------------------------------------------------------------

const PROFILE  = getEnvironmentVariable('PERF_PROFILE',  'smoke').toLowerCase();
const USERS    = parseInt(getEnvironmentVariable('PERF_USERS',    '20'),  10);
const DURATION = parseInt(getEnvironmentVariable('PERF_DURATION', '120'), 10);

const INJECTION_PROFILES = new Map([
    ['smoke',  () => atOnceUsers(1)],
    ['load',   () => rampUsers(USERS).during(DURATION)],
    ['stress', () => atOnceUsers(USERS)],
]);

function injectionProfile() {
    const factory = INJECTION_PROFILES.get(PROFILE);
    if (!factory) {
        throw new Error(
            `Unknown PERF_PROFILE="${PROFILE}". Valid values: ${[...INJECTION_PROFILES.keys()].join(' | ')}`,
        );
    }
    return factory();
}

// ---------------------------------------------------------------------------
// Simulation — Login then GET /api/pizzas. The login leg primes a token
// so the catalog request carries Authorization; this matches the runtime
// dispatch (CatalogDao.authHeaders).
// ---------------------------------------------------------------------------

export default simulation((setUp) => {
    const apiBaseUrl = getEnvironmentVariable('API_BASE_URL');
    if (!apiBaseUrl) {
        throw new Error('Missing required env var: API_BASE_URL');
    }

    const httpProtocol = http
        .baseUrl(apiBaseUrl)
        .header('Content-Type', 'application/json')
        .header('X-Language', getEnvironmentVariable('LANGUAGE', 'en'));

    const catalogScenario = scenario('Catalog API Flow')
        .feed(catalogFeeder)

        // ── Step 1: Login (fixed standard_user, mirrors order-success-load) ─
        .exec(
            http('Login')
                .post('/api/auth/login')
                .body(StringBody('{"username":"standard_user","password":"pizza123"}'))
                .check(jsonPath('$.access_token').saveAs('token')),
        )

        // ── Step 2: GET /api/pizzas ─────────────────────────────────────────
        // Per task spec, the simulation includes `?country={market}`. The
        // production backend currently reads `x-country-code` from the
        // header — see the docstring at the top of this file for the
        // intentional divergence. Both are sent so the load profile stays
        // representative regardless of which dimension is honored.
        .exec(
            http('Get Pizzas')
                .get((s: Session) => `/api/pizzas?country=${s.get<string>('market')}`)
                .header('Authorization',  (s: Session) => `Bearer ${s.get<string>('token')}`)
                .header('x-country-code', (s: Session) => s.get<string>('market'))
                .header('X-Language',     (s: Session) => s.get<string>('language'))
                .check(jsonPath('$.pizzas').exists()),
        );

    setUp(catalogScenario.injectOpen(injectionProfile())).protocols(httpProtocol);
});
