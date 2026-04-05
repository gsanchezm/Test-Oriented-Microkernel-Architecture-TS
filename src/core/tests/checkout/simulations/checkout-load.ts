/**
 * Checkout Load Simulation
 *
 * Mirrors the checkout.feature scenario at the API level:
 *   Login → Get Pizzas (by market) → Add to Cart
 *
 * Test data comes directly from the feature file Examples tables (US/MX/CH/JP).
 * Each virtual user is assigned a scenario from the feeder in circular order.
 *
 * Usage:
 *   pnpm perf:smoke    →  1 user, single iteration (validate the chain works)
 *   pnpm perf:load     →  ramp to 20 users over 2 min
 *   pnpm perf:stress   →  50 users injected at once
 *
 * Env overrides:
 *   PERF_USERS=N       override concurrent user count for load/stress
 *   PERF_DURATION=N    ramp duration in seconds (load profile only, default: 120)
 */

import {
    simulation,
    scenario,
    atOnceUsers,
    rampUsers,
    arrayFeeder,
    StringBody,
    bodyString,
    jsonPath,
    getEnvironmentVariable,
    Session,
} from '@gatling.io/core';
import { http } from '@gatling.io/http';

// ---------------------------------------------------------------------------
// Test data — mirrors checkout.feature Examples tables (Credit Card + Cash rows)
// ---------------------------------------------------------------------------

const checkoutFeeder = arrayFeeder([
    // Examples: Credit Card (active in feature)
    { market: 'US', item: 'Pepperoni', size: 'Large',  qty: 1 },
    // Examples: commented rows — included here to distribute load across markets
    { market: 'MX', item: 'Margarita', size: 'Medium', qty: 3 },
    { market: 'CH', item: 'Marinara',  size: 'Small',  qty: 1 },
    { market: 'JP', item: 'Pepperoni', size: 'Family', qty: 2 },
]).circular();

// ---------------------------------------------------------------------------
// Injection profile — controlled by PERF_PROFILE env var
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

    const checkout = scenario('Checkout API Flow')
        .feed(checkoutFeeder)

        // ── Step 1: Login ──────────────────────────────────────────────────
        // Mirrors: "Given the OmniPizza user is logged in as standard_user"
        .exec(
            http('Login')
                .post('/api/auth/login')
                .body(StringBody('{"username":"standard_user","password":"pizza123"}'))
                .check(jsonPath('$.token').saveAs('token')),
        )

        // ── Step 2: Get Pizzas for the feeder market ───────────────────────
        // Mirrors: "they are ordering in market <market>" + pizza catalog fetch
        .exec(
            http('Get Pizzas')
                .get('/api/pizzas')
                .header('Authorization', (session: Session) => `Bearer ${session.get<string>('token')}`)
                .header('x-country-code', (session: Session) => session.get<string>('market'))
                .check(bodyString().saveAs('pizzasBody')),
        )

        // ── Extract pizza ID matching feeder item ──────────────────────────
        // Mirrors: OrderingDao.getPizzas → find by name
        .exec((session: Session) => {
            const body  = JSON.parse(session.get<string>('pizzasBody'));
            const item  = session.get<string>('item');
            const pizza = (body.pizzas as Array<{ id: string; name: string }>)
                .find((p) => p.name.toLowerCase() === item.toLowerCase());

            if (!pizza) {
                console.error(`[checkout-load] Pizza "${item}" not found for market "${session.get('market')}"`);
                return session.markAsFailed();
            }

            return session.set('pizzaId', pizza.id);
        })

        // ── Step 3: Add to Cart ────────────────────────────────────────────
        // Mirrors: "they have an order with <item> size <size> quantity <qty>"
        .exec(
            http('Add to Cart')
                .post('/api/cart')
                .header('Authorization', (session: Session) => `Bearer ${session.get<string>('token')}`)
                .header('x-country-code', (session: Session) => session.get<string>('market'))
                .body(
                    StringBody((session: Session) =>
                        JSON.stringify({
                            items: [{
                                pizza_id: session.get<string>('pizzaId'),
                                size:     session.get<string>('size'),
                                quantity: session.get<number>('qty'),
                            }],
                        }),
                    ),
                )
                .check(jsonPath('$.cart_items').exists()),
        );

    setUp(checkout.injectOpen(injectionProfile())).protocols(httpProtocol);
});
