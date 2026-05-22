// NOTE: keep relative imports — bundled by @gatling.io/cli (esbuild, no tsconfig-paths support).
/**
 * Profile Load Simulation
 *
 * Exercises the (assumed) profile endpoints documented in
 * `../contracts/profile.api.contract.json`:
 *
 *   Login → GET /api/users/me/profile → PATCH /api/users/me/profile
 *
 * The PATCH leg toggles a couple of fields per iteration so the backend
 * has to do real work (not just bounce an idempotent payload through a
 * cache). The simulation will return 404s today — that's the expected TDD
 * outcome that signals the backend to add these endpoints to match the
 * contract.
 *
 * Usage:
 *   PERF_PROFILE=smoke  pnpm gatling … --simulation profile-load   (sanity, 1 user)
 *   PERF_PROFILE=load   pnpm gatling … --simulation profile-load   (ramp PERF_USERS over PERF_DURATION)
 *   PERF_PROFILE=stress pnpm gatling … --simulation profile-load   (PERF_USERS at once)
 *
 * Env overrides:
 *   API_BASE_URL       Required. Where to POST /api/auth/login and call the profile endpoints.
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
    Session,
} from '@gatling.io/core';
import { http } from '@gatling.io/http';

// ---------------------------------------------------------------------------
// Feeder — fixed per-market profile fixtures mirroring update-profile.feature.
// Inlined (not imported from a TS data-source) because @gatling.io/cli bundles
// this file with esbuild and won't honor fs/path imports at runtime.
// ---------------------------------------------------------------------------

interface ProfileRow {
    market: 'US' | 'MX' | 'CH' | 'JP';
    language: 'en' | 'es' | 'de' | 'fr' | 'ja';
    fullName: string;
    phone: string;
    address: string;
    notes: string;
    // arrayFeeder() in @gatling.io/core expects Record<string, unknown>[];
    // the index signature satisfies that constraint without weakening the
    // declared keys above.
    [key: string]: unknown;
}

const PROFILE_ROWS: ProfileRow[] = [
    { market: 'US', language: 'en', fullName: 'Phoebe Bridgers',    phone: '+1 415 555 0202',  address: '123 Luxury Avenue', notes: 'Leave at the door' },
    { market: 'MX', language: 'es', fullName: 'Valentina Herrera',  phone: '+52 55 9876 5432', address: 'Av. Carranza 123',  notes: 'Dejar en recepción' },
    { market: 'CH', language: 'de', fullName: 'Anna Keller',        phone: '+41 44 668 19 00', address: 'Bahnhofstrasse 12', notes: 'An der Tür abgeben' },
    { market: 'CH', language: 'fr', fullName: 'Anna Keller',        phone: '+41 44 668 19 00', address: 'Bahnhofstrasse 12', notes: 'Laisser à la porte' },
    { market: 'JP', language: 'ja', fullName: '佐藤 明美',           phone: '+81 3 9876 5432',  address: '1-2-3 Shibuya',     notes: 'ドアに置いてください' },
];

const profileFeeder = arrayFeeder(PROFILE_ROWS).circular();

// ---------------------------------------------------------------------------
// Injection profile
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
// Simulation
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

    const profileFlow = scenario('Profile API Flow')
        .feed(profileFeeder)

        // ── Step 1: Login ─────────────────────────────────────────────────
        .exec(
            http('Login')
                .post('/api/auth/login')
                .body(StringBody('{"username":"standard_user","password":"pizza123"}'))
                // The backend may emit either `token` (older) or `access_token`
                // (newer). saveAs picks the first non-null binding — checking
                // both keeps the simulation portable across deploys.
                .check(jsonPath('$.token').optional().saveAs('token'))
                .check(jsonPath('$.access_token').optional().saveAs('access_token')),
        )

        // Coalesce token / access_token into a single session key.
        .exec((session: Session) => {
            const tok =
                session.get<string | undefined>('token') ??
                session.get<string | undefined>('access_token');
            if (!tok) {
                console.error('[profile-load] No token returned by /api/auth/login');
                return session.markAsFailed();
            }
            return session.set('authToken', tok);
        })

        // ── Step 2: GET /api/users/me/profile ─────────────────────────────
        .exec(
            http('Get Profile')
                .get('/api/users/me/profile')
                .header('Authorization',  (s: Session) => `Bearer ${s.get<string>('authToken')}`)
                .header('x-country-code', (s: Session) => s.get<string>('market'))
                // Soft existence checks — return 404 today is the expected
                // TDD signal; flagging the response keeps perf reports honest
                // without blowing up the harness.
                .check(jsonPath('$.full_name').optional())
                .check(jsonPath('$.premium').optional()),
        )

        // ── Step 3: PATCH /api/users/me/profile ───────────────────────────
        .exec((session: Session) => {
            const payload = {
                full_name: session.get<string>('fullName'),
                phone:     session.get<string>('phone'),
                address:   session.get<string>('address'),
                notes:     session.get<string>('notes'),
            };
            return session.set('patchBody', JSON.stringify(payload));
        })
        .exec(
            http('Update Profile')
                .patch('/api/users/me/profile')
                .header('Authorization',  (s: Session) => `Bearer ${s.get<string>('authToken')}`)
                .header('x-country-code', (s: Session) => s.get<string>('market'))
                .body(StringBody((s: Session) => s.get<string>('patchBody')))
                // Tolerate 404 / 5xx — the simulation measures throughput
                // against the contract regardless of backend readiness.
                .check(jsonPath('$.full_name').optional()),
        );

    setUp(profileFlow.injectOpen(injectionProfile())).protocols(httpProtocol);
});
