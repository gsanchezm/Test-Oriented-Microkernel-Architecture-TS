// NOTE: keep relative imports — bundled by @gatling.io/cli (esbuild, no tsconfig-paths support).
/**
 * Pizza Builder Load Simulation
 *
 * Exercises the API leg the customizer ultimately hits when the user
 * confirms a customized line:
 *   Login → Get Pizzas (by market) → POST /api/cart {pizza_id, size, toppings, quantity}
 *
 * The .feature file's Examples table is inlined here as a fixed feeder.
 * Adding a row in the feature does NOT auto-regenerate this feeder — the
 * builder's data matrix is small (5 rows) and stable, so we accept the
 * manual duplication in exchange for not introducing a scripts/ generator
 * just for one slice. If the matrix grows past a dozen rows, lift this to
 * the checkout-rows-generated.ts pattern.
 *
 * Usage:
 *   pnpm perf:pizza-builder:smoke    →  1 user, single iteration
 *   pnpm perf:pizza-builder:load     →  ramp to PERF_USERS over PERF_DURATION s
 *   pnpm perf:pizza-builder:stress   →  PERF_USERS at once
 *
 * Env overrides:
 *   API_BASE_URL       Required. Where to POST /api/auth/login etc.
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
    bodyString,
    jsonPath,
    getEnvironmentVariable,
    Session,
} from '@gatling.io/core';
import { http } from '@gatling.io/http';

// ---------------------------------------------------------------------------
// Feeder — mirror of customize-pizza.feature Examples (Confirming-add-to-cart
// scenario), one row per market/language. Topping IDs match what the FE
// surfaces via data-testid='topping-<id>'.
// ---------------------------------------------------------------------------

interface PizzaBuilderRow {
    market: 'US' | 'MX' | 'CH' | 'JP';
    language: 'en' | 'es' | 'de' | 'fr' | 'ja';
    item: string;
    size: 'Small' | 'Medium' | 'Large' | 'Family';
    toppings: string[];
    // arrayFeeder() expects Record<string, unknown>[] — index signature
    // keeps the declared keys above without weakening their literal types.
    [key: string]: unknown;
}

const PIZZA_BUILDER_ROWS: PizzaBuilderRow[] = [
    { market: 'US', language: 'en', item: 'Pepperoni',  size: 'Large',  toppings: ['extra-cheese'] },
    { market: 'MX', language: 'es', item: 'Margherita', size: 'Medium', toppings: ['mushrooms', 'olives'] },
    { market: 'CH', language: 'de', item: 'Marinara',   size: 'Small',  toppings: ['extra-cheese'] },
    { market: 'CH', language: 'fr', item: 'Marinara',   size: 'Small',  toppings: ['mushrooms'] },
    { market: 'JP', language: 'ja', item: 'Pepperoni',  size: 'Family', toppings: ['extra-cheese', 'jalapeno'] },
];

const pizzaBuilderFeeder = arrayFeeder(PIZZA_BUILDER_ROWS).circular();

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

    const builder = scenario('Pizza Builder API Flow')
        .feed(pizzaBuilderFeeder)

        // ── Step 1: Login ─────────────────────────────────────────────────
        .exec(
            http('Login')
                .post('/api/auth/login')
                .body(StringBody('{"username":"standard_user","password":"pizza123"}'))
                .check(jsonPath('$.access_token').saveAs('token')),
        )

        // ── Step 2: Get Pizzas for the feeder market ──────────────────────
        .exec(
            http('Get Pizzas')
                .get('/api/pizzas')
                .header('Authorization',  (s: Session) => `Bearer ${s.get<string>('token')}`)
                .header('x-country-code', (s: Session) => s.get<string>('market'))
                .header('X-Language',     (s: Session) => s.get<string>('language'))
                .check(bodyString().saveAs('pizzasBody')),
        )

        // ── Resolve pizza id by name ──────────────────────────────────────
        .exec((session: Session) => {
            const body  = JSON.parse(session.get<string>('pizzasBody'));
            const item  = session.get<string>('item');
            const pizza = (body.pizzas as Array<{ id: string; name: string }>)
                .find((p) => p.name.toLowerCase() === item.toLowerCase());
            if (!pizza) {
                console.error(`[pizzaBuilder-load] Pizza "${item}" not found for "${session.get('market')}"`);
                return session.markAsFailed();
            }
            return session.set('pizzaId', pizza.id);
        })

        // ── Step 3: POST /api/cart with customized line ───────────────────
        // Wire shape (the new builder contract):
        //   { items: [{ pizza_id, size, toppings: string[], quantity }] }
        // The toppings array is the load-bearing difference from the
        // checkout slice's POST /api/cart — see pizzaBuilder.api.contract.json.
        .exec((session: Session) => {
            const cartBody = JSON.stringify({
                items: [{
                    pizza_id: session.get<string>('pizzaId'),
                    size:     session.get<string>('size'),
                    toppings: session.get<string[]>('toppings'),
                    quantity: 1,
                }],
            });
            return session.set('cartBody', cartBody);
        })
        .exec(
            http('Add Customized To Cart')
                .post('/api/cart')
                .header('Authorization',  (s: Session) => `Bearer ${s.get<string>('token')}`)
                .header('x-country-code', (s: Session) => s.get<string>('market'))
                .header('X-Language',     (s: Session) => s.get<string>('language'))
                .body(StringBody((s: Session) => s.get<string>('cartBody')))
                .check(jsonPath('$.cart_items[0].pizza_id').exists()),
        );

    setUp(builder.injectOpen(injectionProfile())).protocols(httpProtocol);
});
