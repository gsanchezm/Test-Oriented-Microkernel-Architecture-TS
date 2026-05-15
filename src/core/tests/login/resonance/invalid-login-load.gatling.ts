/**
 * Invalid Login Load Simulation
 *
 * NEGATIVE auth paths only — every request in this simulation is *expected*
 * to be rejected by /api/auth/login. Feeder rotates across the 5 failure
 * cases pinned by invalid-login.feature:
 *   missing-username, missing-password, both-empty,
 *   invalid-credentials, locked-out.
 *
 * The PASS condition is therefore a 4xx response (400/401/403/422). A 2xx
 * here would mean the auth endpoint leaked — the simulation will fail loud.
 *
 * Usage:
 *   pnpm perf:login-invalid:smoke    →  1 user, single iteration
 *   pnpm perf:login-invalid:load     →  ramp to PERF_USERS over PERF_DURATION s
 *   pnpm perf:login-invalid:stress   →  PERF_USERS at once
 *
 * Env overrides:
 *   API_BASE_URL       Required. Where to POST /api/auth/login.
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
    StringBody,
    getEnvironmentVariable,
} from '@gatling.io/core';
import { http, status } from '@gatling.io/http';

// Inlined here (not imported from a TS data-source) because @gatling.io/cli
// bundles this file with esbuild and won't honor fs/path imports at runtime.
const INVALID_LOGIN_PAYLOADS: Array<Record<string, string>> = [
    { case: 'missing-username',     username: '',                password: 'pizza123'   },
    { case: 'missing-password',     username: 'standard_user',   password: ''           },
    { case: 'both-empty',           username: '',                password: ''           },
    { case: 'invalid-credentials',  username: 'not_a_user',      password: 'not_a_pass' },
    { case: 'locked-out',           username: 'locked_out_user', password: 'pizza123'   },
];

const invalidLoginFeeder = arrayFeeder(INVALID_LOGIN_PAYLOADS).circular();

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

export default simulation((setUp) => {
    const apiBaseUrl = getEnvironmentVariable('API_BASE_URL');
    if (!apiBaseUrl) {
        throw new Error('Missing required env var: API_BASE_URL');
    }

    const httpProtocol = http
        .baseUrl(apiBaseUrl)
        .header('Content-Type', 'application/json')
        .header('X-Language', getEnvironmentVariable('LANGUAGE', 'en'));

    const invalidLogin = scenario('Invalid Login API Flow')
        .feed(invalidLoginFeeder)
        .exec(
            http('Invalid Login')
                .post('/api/auth/login')
                .body(StringBody((session) => JSON.stringify({
                    username: session.get<string>('username'),
                    password: session.get<string>('password'),
                })))
                // PASS condition is a 4xx — these payloads MUST be rejected.
                // A 2xx response would mean the auth endpoint leaked.
                .check(status().in(400, 401, 403, 422)),
        );

    setUp(invalidLogin.injectOpen(injectionProfile())).protocols(httpProtocol);
});
