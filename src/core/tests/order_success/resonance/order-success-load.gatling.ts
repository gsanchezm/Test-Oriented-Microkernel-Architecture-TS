// NOTE: keep relative imports — bundled by @gatling.io/cli (esbuild, no tsconfig-paths support).
/**
 * Order Success Load Simulation
 *
 * Exercises the API path that backs the atomic order-success flow:
 *   Login → Get Pizzas → addToCart → placeOrder → GET /api/orders/{order_id}
 *
 * The last leg (`getOrder`) is what OmniPizza calls internally when a deep
 * link with `?orderId=…` lands on the success screen (mobile:
 * useDeepLinkParams.ts:117-128, web: OrderSuccess.jsx:21-26). Putting it
 * under load here measures the screen's hydration tail latency.
 *
 * Feeder rotates across the four available markets so each run touches every
 * country's required_fields path.
 *
 * Usage:
 *   pnpm perf:order-success:smoke    →  1 user, single iteration (sanity)
 *   pnpm perf:order-success:load     →  ramp to PERF_USERS over PERF_DURATION s
 *   pnpm perf:order-success:stress   →  PERF_USERS at once
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
// Feeder — fixed per-market fixture mirroring place-delivery-order.feature.
// Inlined (not imported from a TS data-source) because @gatling.io/cli bundles
// this file with esbuild and won't honor fs/path imports at runtime.
// ---------------------------------------------------------------------------

interface OrderSuccessRow {
    market: 'US' | 'MX' | 'CH' | 'JP';
    item: string;
    size: string;
    qty: number;
    street: string;
    zip: string;
    suburb?: string;
    name: string;
    phone: string;
    card: string;
    exp: string;
    cvv: string;
    // arrayFeeder() in @gatling.io/core expects Record<string, unknown>[];
    // the index signature satisfies that constraint without weakening the
    // declared keys above.
    [key: string]: unknown;
}

const ORDER_SUCCESS_ROWS: OrderSuccessRow[] = [
    { market: 'US', item: 'Pepperoni',  size: 'Large',  qty: 1, street: '123 Luxury Avenue', zip: '90210',    name: 'Julian Casablancas',  phone: '+1 415 555 0101',  card: '4242 4242 4242 4242', exp: '12/28', cvv: '123' },
    { market: 'MX', item: 'Margherita', size: 'Medium', qty: 1, street: 'Av. Carranza 123',  zip: '78230',    suburb: 'Polanco', name: 'Guillermo Alcantara', phone: '+52 55 1234 5678', card: '4242 4242 4242 4242', exp: '12/28', cvv: '123' },
    { market: 'CH', item: 'Marinara',   size: 'Small',  qty: 1, street: 'Bahnhofstrasse 12', zip: '8001',     name: 'Lukas Baumgartner',   phone: '+41 44 668 18 00', card: '4242 4242 4242 4242', exp: '12/28', cvv: '123' },
    { market: 'JP', item: 'Pepperoni',  size: 'Family', qty: 1, street: '1-2-3 Shibuya',     zip: '150-0002', suburb: 'Tokyo',   name: '田中 健太',           phone: '+81 3 1234 5678',  card: '4242 4242 4242 4242', exp: '12/28', cvv: '123' },
];

const orderSuccessFeeder = arrayFeeder(ORDER_SUCCESS_ROWS).circular();

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

    const orderSuccess = scenario('Order Success API Flow')
        .feed(orderSuccessFeeder)

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
                .check(bodyString().saveAs('pizzasBody')),
        )

        // ── Resolve pizza id by name ──────────────────────────────────────
        .exec((session: Session) => {
            const body  = JSON.parse(session.get<string>('pizzasBody'));
            const item  = session.get<string>('item');
            const pizza = (body.pizzas as Array<{ id: string; name: string }>)
                .find((p) => p.name.toLowerCase() === item.toLowerCase());
            if (!pizza) {
                console.error(`[order-success-load] Pizza "${item}" not found for "${session.get('market')}"`);
                return session.markAsFailed();
            }
            return session.set('pizzaId', pizza.id);
        })

        // ── Step 3: addToCart ─────────────────────────────────────────────
        .exec((session: Session) => {
            const cartBody = JSON.stringify({
                items: [{
                    pizza_id: session.get<string>('pizzaId'),
                    size:     session.get<string>('size'),
                    quantity: session.get<number>('qty'),
                }],
            });
            return session.set('cartBody', cartBody);
        })
        .exec(
            http('Add To Cart')
                .post('/api/cart')
                .header('Authorization',  (s: Session) => `Bearer ${s.get<string>('token')}`)
                .header('x-country-code', (s: Session) => s.get<string>('market'))
                .body(StringBody((s: Session) => s.get<string>('cartBody'))),
        )

        // ── Step 4: placeOrder ────────────────────────────────────────────
        // Sends machine values for payment_method ('card' / 'cash') to match
        // the backend's pydantic Literal validator — bypasses the UI's label
        // translation layer.
        .exec((session: Session) => {
            const market  = session.get<string>('market');
            const zip     = session.get<string>('zip');
            const suburb  = session.get<string | undefined>('suburb');

            const payload: Record<string, unknown> = {
                country_code: market,
                items: [{
                    pizza_id: session.get<string>('pizzaId'),
                    size:     session.get<string>('size'),
                    quantity: session.get<number>('qty'),
                }],
                name:           session.get<string>('name'),
                address:        session.get<string>('street'),
                phone:          session.get<string>('phone'),
                payment_method: 'card',
                card_number:    session.get<string>('card'),
                card_expiry:    session.get<string>('exp'),
                card_cvv:       session.get<string>('cvv'),
            };

            if (market === 'CH')                payload['plz']        = zip;
            else                                payload['zip_code']   = zip;
            if (market === 'MX' && suburb)      payload['colonia']    = suburb;
            if (market === 'JP' && suburb)      payload['prefectura'] = suburb;

            return session.set('checkoutBody', JSON.stringify(payload));
        })
        .exec(
            http('Place Order')
                .post('/api/checkout')
                .header('Authorization',  (s: Session) => `Bearer ${s.get<string>('token')}`)
                .header('x-country-code', (s: Session) => s.get<string>('market'))
                .body(StringBody((s: Session) => s.get<string>('checkoutBody')))
                .check(jsonPath('$.order_id').saveAs('orderId')),
        )

        // ── Step 5: GET /api/orders/{order_id} ────────────────────────────
        // This is the actual leg the success screen depends on — the deep
        // link param hits this endpoint to hydrate lastOrder.
        .exec(
            http('Get Order')
                .get((s: Session) => `/api/orders/${s.get<string>('orderId')}`)
                .header('Authorization',  (s: Session) => `Bearer ${s.get<string>('token')}`)
                .header('x-country-code', (s: Session) => s.get<string>('market'))
                .check(jsonPath('$.order_id').exists())
                .check(jsonPath('$.total').exists())
                .check(jsonPath('$.currency').exists()),
        );

    setUp(orderSuccess.injectOpen(injectionProfile())).protocols(httpProtocol);
});
