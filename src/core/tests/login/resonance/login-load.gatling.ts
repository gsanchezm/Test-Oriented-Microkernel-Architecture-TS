/**
 * Login Load Simulation
 *
 * Feeder rotates across a small set of test users (read from users.json at
 * build time → inlined into the generated feeder file). The OmniPizza
 * `/api/auth/login` endpoint is hit at the configured injection rate.
 *
 * Usage:
 *   pnpm perf:smoke    →  1 user, single iteration
 *   pnpm perf:load     →  ramp to PERF_USERS over PERF_DURATION s
 *   pnpm perf:stress   →  PERF_USERS at once
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
    jsonPath,
    getEnvironmentVariable,
} from '@gatling.io/core';
import { http } from '@gatling.io/http';

// Inlined here (not imported from a TS data-source) because @gatling.io/cli
// bundles this file with esbuild and won't honor fs/path imports at runtime.
const LOGIN_USERS: Array<Record<string, string>> = [
    { username: 'standard_user',            password: 'pizza123' },
    { username: 'locked_out_user',          password: 'pizza123' },
    { username: 'problem_user',             password: 'pizza123' },
    { username: 'performance_glitch_user',  password: 'pizza123' },
];

const loginFeeder = arrayFeeder(LOGIN_USERS).circular();

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

    const login = scenario('Login API Flow')
        .feed(loginFeeder)
        .exec(
            http('Login')
                .post('/api/auth/login')
                .body(StringBody((session) => JSON.stringify({
                    username: session.get<string>('username'),
                    password: session.get<string>('password'),
                })))
                // Tolerate locked_out_user / problem_user returning 401 — the
                // simulation measures auth-endpoint throughput, not policy.
                .check(jsonPath('$.token').optional()),
        );

    setUp(login.injectOpen(injectionProfile())).protocols(httpProtocol);
});
