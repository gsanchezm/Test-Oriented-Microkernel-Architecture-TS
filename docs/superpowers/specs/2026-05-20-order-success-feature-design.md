# Order Success Feature — Design Spec

**Date:** 2026-05-20
**Domain:** `src/core/tests/order_success/`
**Status:** Approved design, pending implementation plan

## 1. Problem statement

The OmniPizza checkout flow already has end-to-end coverage in `place-delivery-order.feature`, whose final assertion is `Then the order is accepted`. That step implicitly waits for the order-success screen, but it does **not** validate what that screen renders. Regressions in tracking UI, courier card, time estimate, or i18n on the success screen go undetected by the existing suite.

The empty domain scaffold at `src/core/tests/order_success/` (locators, organisms, molecules, step_definitions, features, dao, resonance) signals an intent to land a dedicated suite for that screen. This spec defines it.

## 2. Goal

Add a single Cucumber feature that validates the order success screen across the four available markets (US, MX, CH-de, CH-fr, JP), covering:

- Screen lands and shows the localized status title.
- Live tracking badge is rendered.
- Estimated delivery time block is rendered.
- Courier card shows name and vehicle.
- "Order details" label is localized.
- "View order details" affordance is rendered.

Driver coverage: `playwright`, `mobilewright`, `appium` (web + Android + iOS). `api` driver is excluded — the success screen is UI-only.

## 3. Non-goals

- **Order ID / total numeric validation** — deferred. Mobile screen does not expose `order_id` or `total` (only web does), so cross-platform assertion would require asymmetric scenarios. Future iteration.
- **Visual snapshots** — deferred. The locator surface and a visual hook (`order_success.visual.json` + `step_definitions/visual.hooks.ts`) can be added later without changing this feature.
- **Pixel-perfect i18n validation** — only two translated strings are asserted (status title, order-details label), using case-insensitive substring match.
- **Negative paths** — payment rejection, network failure, missing courier data, etc. Not in scope.
- **Performance suite** — `resonance/` stays empty for this domain.

## 4. Constraints discovered during brainstorming

### 4.1 True atomic deep link to order success (now available)

The backend exposes `GET /api/orders/{order_id}` (`backend/main.py:291-313`) and as of the latest OmniPizza release the client side is wired through:

- **`frontend-mobile/src/services/order.service.ts:9-12`** — exposes `getOrder(orderId)` returning the order payload.
- **`frontend-mobile/src/hooks/useDeepLinkParams.ts:117-128`** — when the deep link carries `orderId`, the hook fires `orderService.getOrder(params.orderId).then(setLastOrder)` after `accessToken` is set. React Navigation enroutes independently via `linking.ts`.
- **`frontend-mobile/src/navigation/linking.ts:22`** — documents `order-success: orderId`.
- **`frontend/src/pages/OrderSuccess.jsx:16-26`** — reads `?orderId` with `useSearchParams`, fetches via `orderService.getOrder()` inside `useEffect`, and calls `setLastOrder(data)`. Falls back to courier-only render if the fetch fails.

A test can therefore: (1) place an order via the `CheckoutDao` to obtain a real `order_id`, then (2) deep-link directly to the success screen carrying that id, without ever touching the checkout UI. This is the path the feature uses (see §5 onward).

Web-only nuance: the route is protected (`App.jsx:35-40`), so the test must establish auth before navigation. Two options: (a) seed `localStorage["omnipizza-auth"]` (Zustand persist) before `NAVIGATE`, or (b) drive the login UI once. (a) keeps everything atomic and is the chosen path.

### 4.2 Language injection asymmetry

- **Mobile** — `useDeepLinkParams.ts` already accepts `?lang=fr|de` (CH-only override; other markets default via `setCountry`). No app change needed.
- **Web** — `useCountryStore.setLanguage(lang)` only works for CH (`store.js:115-126`). There is no URL param. The store is persisted to `localStorage["omnipizza-country"]` via Zustand `persist`. The test seeds localStorage with the desired language **before** navigation, and Zustand rehydrates on mount. Concretely: `localStorage.setItem("omnipizza-country", JSON.stringify({state: {countryCode, language, locale, currency, countryInfo: null}, version: 0}))` plus `localStorage.setItem("chLang", language)` when applicable. This is the lowest-risk path and avoids depending on the store being exposed on `window`.

### 4.3 Cucumber.js Background placeholders

`@cucumber/cucumber` does not substitute `<placeholders>` in Background steps; only Scenario Outline steps get substitution from the Examples table. The `Background` therefore holds only the login (non-parametrized); the placement steps live in the Scenario Outline body.

### 4.4 Courier data is mock-static

`getCourierProfile()` returns a hardcoded object on both platforms: `{ name: "Carlos R.", rating: "4.9", vehicle: "driving" }`. The mobile screen also hardcodes `"CARLOS"` in `text-courier-tag` and `"8:45 PM"` in `text-status-sub` and `"15-20"` in `text-time-estimate`. Tests assert **presence** of these elements, not specific values, so a courier-data refactor (e.g., backend-supplied profile) does not break the suite.

## 5. The feature file

`src/core/tests/order_success/features/order-success.feature`:

```gherkin
Feature: Order success screen surfaces tracking & courier per market
  After a successful checkout, OmniPizza lands on the success screen with
  a live tracking badge, an estimated delivery window, the courier card
  (name, vehicle, rating) and a "view order details" affordance. The
  status title and order-details label are translated per market language.

    As an OmniPizza user,
    I want a clear confirmation screen after placing an order,
    So that I know my order is in motion and who is delivering it.

  Background:
    Given the OmniPizza user is logged in as "standard_user"

  @desktop @responsive @android @ios @visual
  Scenario Outline: Order success screen in <market>/<language> shows tracking + courier
    Given a placed order exists in market "<market>" using language "<language>"
    When they open the order success screen
    Then the order success screen is fully displayed with status "<outForDelivery>"
    And the tracking information, courier details, and order details "<orderDetails>" are visible

    Examples:
      | market | language | outForDelivery        | orderDetails           |
      | US     | en       | Out for delivery      | ORDER DETAILS          |
      | MX     | es       | En camino             | DETALLES DEL PEDIDO    |
      | CH     | de       | In Zustellung         | BESTELLDETAILS         |
      | CH     | fr       | En cours de livraison | DÉTAILS DE LA COMMANDE |
      | JP     | ja       | 配達中                  | 注文詳細                 |
```

The placement is encapsulated inside the `Given a placed order exists ...` step (all DAO; no UI). The `When they open the order success screen` step issues the deep link / web navigation. The pizza, address, contact, and payment data are fixed defaults per market held inside the route — surfaced in §8.

## 6. Architecture

Follows the same layering as `src/core/tests/checkout/`. The new feature reuses existing checkout pieces wherever possible.

```
src/core/tests/order_success/
├── contracts/
│   ├── order_success.locators.json   ← patched in previous step
│   ├── order_success.api.contract.json   (later iteration)
│   └── order_success.visual.json     (later iteration)
├── dao/                              (empty — reuses CheckoutDao)
├── features/
│   └── order-success.feature         ← NEW
├── molecules/
│   └── order-success-screen.molecule.ts  ← NEW
├── organisms/
│   └── order-success.route.ts        ← NEW
├── resonance/                        (empty — no perf suite)
└── step_definitions/
    └── order-success.steps.ts        ← NEW
```

### 6.1 Step bindings (`order-success.steps.ts`)

```ts
// Reused as-is from checkout.steps.ts via cucumber's global step registry:
//   Given the OmniPizza user is logged in as "{string}"

// NEW step bindings:
Given('a placed order exists in market {string} using language {string}',
  async function (market, language) { await route(this).createPlacedOrder(market, language); });

When('they open the order success screen',
  async function () { await route(this).openSuccessScreen(); });

Then('the order success screen is fully displayed with status {string}',
  async function (expectedStatus) { await route(this).verifyScreenAndStatus(expectedStatus); });

Then('the tracking information, courier details, and order details {string} are visible',
  async function (expectedOrderDetails) { await route(this).verifyTrackingAndDetails(expectedOrderDetails); });
```

### 6.2 Route (`order-success.route.ts`)

Reuses `CheckoutWorld` (defined in `src/core/tests/support/world.ts`) — no new world type. Uses `CheckoutRoute.setMarket` + `CheckoutRoute.addToOrder` for the API-side cart setup, then submits via `CheckoutDao.placeOrder` directly (no UI). The captured `order_id` rides the deep link to the success screen.

```ts
export class OrderSuccessRoute {
  private readonly checkoutRoute: CheckoutRoute;
  private readonly checkoutDao: CheckoutDao;

  constructor(world: CheckoutWorld) {
    this.checkoutRoute = new CheckoutRoute(world);
    this.checkoutDao = new CheckoutDao();
  }

  // Pure DAO placement: setMarket → addToCart (fixed fixture) → placeOrder.
  // Captures order_id in world for the next step. No UI touched.
  async createPlacedOrder(market: CountryCode, language: LanguageCode): Promise<void> {
    await this.checkoutRoute.setMarket(market);
    const fixture = ORDER_FIXTURES[market];
    await this.checkoutRoute.addToOrder(fixture.item, fixture.size, fixture.qty);

    const { token } = this.requireAuth();
    const country = this.world.orderContext!.countryInfo;
    const body = buildCheckoutRequest(market, country, fixture);
    const result = await this.checkoutDao.placeOrder({ token, countryCode: market, body });
    if (!result.order_id) throw new Error(`placeOrder DAO returned no order_id: ${JSON.stringify(result)}`);

    this.world.placedOrderId = result.order_id;
    this.world.languageOverride = language;
  }

  // Deep-link (mobile) or seeded navigation (web) directly to the success
  // screen. Waits for the screen to render.
  async openSuccessScreen(): Promise<void> {
    const { token } = this.requireAuth();
    const market = this.world.orderContext!.market;
    const orderId = this.world.placedOrderId!;
    const lang = this.world.languageOverride!;

    await openOrderSuccess({ market, language: lang, accessToken: token, orderId });
    await waitForSuccessScreen();
  }

  async verifyScreenAndStatus(expectedStatus: string): Promise<void> {
    // waitForSuccessScreen already ran inside openSuccessScreen; this step
    // asserts the localized status title.
    await assertStatusTitleContains(expectedStatus);
  }

  async verifyTrackingAndDetails(expectedOrderDetails: string): Promise<void> {
    await verifyLiveTrackingBadgeVisible();
    await verifyEstimatedDeliveryTimeVisible();
    await verifyCourierCardVisible();
    await assertOrderDetailsLabelContains(expectedOrderDetails);
    await verifyViewOrderDetailsButtonVisible();
  }

  private requireAuth(): { token: string } {
    const token = this.world.auth?.token;
    if (!token) throw new Error('Missing auth token — Background login step did not run.');
    return { token };
  }
}
```

Notes:

- `world.placedOrderId` and `world.languageOverride` are new fields on `CheckoutWorld`; add them in `src/core/tests/support/world.ts`.
- `buildCheckoutRequest()` is a small helper that picks the right zip / colonia / prefectura slot based on `country.required_fields`, mirroring the logic already in `CheckoutRoute.submitOrderViaApi` (lines 318-336 of `checkout.route.ts`). Extract into a shared utility or copy minimally.
- Driver dispatch happens inside the `openOrderSuccess` molecule, not the route.

### 6.3 Molecule (`order-success-screen.molecule.ts`)

Mirrors `checkout-order.molecule.ts`. Each helper issues one intent or a small group, delegating selector resolution to the proxy.

```ts
// ---- Atomic entry into the success screen --------------------------------
interface OpenSuccessArgs {
  market: CountryCode;
  language: LanguageCode;
  accessToken: string;
  orderId: string;
}

export async function openOrderSuccess(args: OpenSuccessArgs): Promise<void> {
  const driver = process.env.DRIVER ?? 'playwright';

  if (driver === 'appium' || driver === 'mobilewright') {
    const params = new URLSearchParams({
      orderId: args.orderId,
      accessToken: args.accessToken,
      market: args.market,
    });
    if (needsLangParam(args.market, args.language)) params.set('lang', args.language);
    await sendIntent(INTENT.DEEP_LINK, `omnipizza://order-success?${params}`);
    return;
  }

  if (driver === 'playwright') {
    // Web is a protected route: seed Zustand-persisted auth + country in
    // localStorage so ProtectedRoute lets us in and the UI renders in the
    // chosen language. lastOrder is hydrated by the page itself via
    // useEffect (OrderSuccess.jsx:21-26) — we don't seed it.
    await seedWebPersistedStores({
      market: args.market,
      language: args.language,
      token: args.accessToken,
    });
    const baseUrl = process.env.BASE_URL;
    if (!baseUrl) throw new Error('Missing required env var: BASE_URL');
    await sendIntent(INTENT.NAVIGATE, `${baseUrl}/order-success?orderId=${args.orderId}`);
    return;
  }

  throw new Error(`order_success feature requires DRIVER ∈ {playwright, mobilewright, appium}; got "${driver}"`);
}

async function seedWebPersistedStores(args: { market: CountryCode; language: LanguageCode; token: string }): Promise<void> {
  // Zustand persist envelope: { state: {...}, version: 0 }. Keys come from
  // frontend/src/store.js — see persist({ name: "omnipizza-auth" | "omnipizza-country" }).
  const auth = { state: { token: args.token, username: 'standard_user', behavior: null }, version: 0 };
  const country = {
    state: {
      countryCode: args.market,
      language: args.language,
      locale: deriveLocale(args.market, args.language),
      currency: deriveCurrency(args.market),
      countryInfo: null,
    },
    version: 0,
  };
  const script = `
    localStorage.setItem('token', ${JSON.stringify(args.token)});
    localStorage.setItem('username', 'standard_user');
    localStorage.setItem('countryCode', ${JSON.stringify(args.market)});
    ${args.market === 'CH' ? `localStorage.setItem('chLang', ${JSON.stringify(args.language)});` : ''}
    localStorage.setItem('omnipizza-auth', ${JSON.stringify(JSON.stringify(auth))});
    localStorage.setItem('omnipizza-country', ${JSON.stringify(JSON.stringify(country))});
  `;
  await sendIntent(INTENT.EVALUATE, script);
}

// ---- Wait + presence helpers --------------------------------------------
export async function waitForSuccessScreen(): Promise<void> {
  await sendIntent(INTENT.WAIT_FOR_ELEMENT, 'orderSuccessScreen||90000');
}

export async function verifyLiveTrackingBadgeVisible(): Promise<void> {
  // Mobile has both a badge container and inner text; web only the text.
  const key = process.env.DRIVER === 'playwright' ? 'liveTrackingText' : 'liveBadgeContainer';
  await sendIntent(INTENT.WAIT_FOR_ELEMENT, `${key}||5000`);
}
export async function verifyEstimatedDeliveryTimeVisible(): Promise<void> {
  await sendIntent(INTENT.WAIT_FOR_ELEMENT, 'timeEstimateText||5000');
  await sendIntent(INTENT.WAIT_FOR_ELEMENT, 'minLabelText||5000');
}
export async function verifyCourierCardVisible(): Promise<void> {
  await sendIntent(INTENT.WAIT_FOR_ELEMENT, 'courierInfoContainer||5000');
  await sendIntent(INTENT.WAIT_FOR_ELEMENT, 'courierNameText||5000');
  await sendIntent(INTENT.WAIT_FOR_ELEMENT, 'courierVehicleText||5000');
}
export async function verifyViewOrderDetailsButtonVisible(): Promise<void> {
  await sendIntent(INTENT.WAIT_FOR_ELEMENT, 'viewOrderDetailsButton||5000');
}

// ---- Text helpers (relaxed contains, case-insensitive) ------------------
// ASSERT_TEXT is strict-equality (plugins/playwright/actions/AssertText.ts);
// we use READ_TEXT and compare in-process. Throws to match the existing
// molecule convention (no jest/chai dependency).
function assertContainsCaseInsensitive(label: string, actual: string, expected: string): void {
  if (!actual.toLowerCase().includes(expected.toLowerCase())) {
    throw new Error(`[${label}] expected to contain "${expected}", got "${actual}"`);
  }
}
export async function assertStatusTitleContains(expected: string): Promise<void> {
  const key = process.env.DRIVER === 'playwright' ? 'orderSuccessTitle' : 'statusTitleText';
  const { payload } = await sendIntent(INTENT.READ_TEXT, key);
  assertContainsCaseInsensitive('statusTitle', String(payload), expected);
}
export async function assertOrderDetailsLabelContains(expected: string): Promise<void> {
  const { payload } = await sendIntent(INTENT.READ_TEXT, 'orderDetailsLabel');
  assertContainsCaseInsensitive('orderDetailsLabel', String(payload), expected);
}

// ---- Helpers ------------------------------------------------------------
function needsLangParam(market: CountryCode, lang: LanguageCode): boolean {
  // useDeepLinkParams.ts only accepts lang=fr|de (CH override). Other markets
  // inherit language from setCountry on the mobile side, so we omit lang.
  return market === 'CH' && (lang === 'de' || lang === 'fr');
}
```

### 6.4 Locator strategy

Already patched in `order_success.locators.json`. Key mappings the new step bindings rely on:

| Concept | Mobile key | Web key |
|---|---|---|
| Screen landed | `orderSuccessScreen` | `orderSuccessScreen` |
| Status title | `statusTitleText` | `orderSuccessTitle` |
| Live tracking | `liveBadgeContainer` (mobile-only) + `liveTrackingText` | `liveTrackingText` |
| Time estimate | `timeEstimateText` + `minLabelText` | `timeEstimateText` + `minLabelText` |
| Courier card | `courierInfoContainer` + `courierNameText` + `courierVehicleText` | same |
| Order details label | `orderDetailsLabel` | `orderDetailsLabel` |
| View order details | `viewOrderDetailsButton` | `viewOrderDetailsButton` |

The proxy's locator-key collision detection (commit `c6dd7de`) gates name overlap; the patched JSON respects this.

## 7. i18n string source of truth

Strings asserted in the Examples table are pulled verbatim from `frontend-mobile/src/i18n/locales/<lang>.json`:

| Lang | `outForDelivery` | `orderDetails` |
|---|---|---|
| en | `Out for delivery` | `ORDER DETAILS` |
| es | `En camino` | `DETALLES DEL PEDIDO` |
| de | `In Zustellung` | `BESTELLDETAILS` |
| fr | `En cours de livraison` | `DÉTAILS DE LA COMMANDE` |
| ja | `配達中` | `注文詳細` |

If the OmniPizza i18n changes, these expected values must be updated in lockstep. A future improvement is a build-time check that compares the table against the JSON files.

## 8. Test data

Placement data is fixed per market, held inside the route as `ORDER_FIXTURES`. The Examples table no longer carries pizza/address/payment fields because they don't vary across rows for the success-screen suite — we only care that an order exists. Fixtures mirror `place-delivery-order.feature` for consistency:

```ts
const ORDER_FIXTURES: Record<CountryCode, OrderFixture> = {
  US: { item: 'Pepperoni',  size: 'Large',  qty: 1, street: '123 Luxury Avenue', zip: '90210',    suburb: undefined, name: 'Julian Casablancas',  phone: '+1 415 555 0101',  card: '4242 4242 4242 4242', exp: '12/28', cvv: '123' },
  MX: { item: 'Margherita', size: 'Medium', qty: 1, street: 'Av. Carranza 123',  zip: '78230',    suburb: 'Polanco', name: 'Guillermo Alcantara', phone: '+52 55 1234 5678', card: '4242 4242 4242 4242', exp: '12/28', cvv: '123' },
  CH: { item: 'Marinara',   size: 'Small',  qty: 1, street: 'Bahnhofstrasse 12', zip: '8001',     suburb: undefined, name: 'Lukas Baumgartner',   phone: '+41 44 668 18 00', card: '4242 4242 4242 4242', exp: '12/28', cvv: '123' },
  JP: { item: 'Pepperoni',  size: 'Family', qty: 1, street: '1-2-3 Shibuya',     zip: '150-0002', suburb: 'Tokyo',   name: '田中 健太',           phone: '+81 3 1234 5678',  card: '4242 4242 4242 4242', exp: '12/28', cvv: '123' },
};
```

All scenarios use `Credit Card` as the payment method. Card details ride into the DAO body via the same field-mapping logic used in `CheckoutRoute.submitOrderViaApi`.

## 9. Risks

| Risk | Mitigation |
|---|---|
| Web Zustand persist envelope (`{state, version}`) changes between OmniPizza releases and `seedWebPersistedStores` writes a stale shape | Read `frontend/src/store.js` at PR review time when bumping the OmniPizza dep; pin a regression alert if either `omnipizza-auth` or `omnipizza-country` persist signature changes |
| Pre-seeded localStorage races with the React app's hydration | Seed via `INTENT.EVALUATE` before `INTENT.NAVIGATE`; Zustand `persist` reads on first mount |
| iOS XCUI `waitForDisplayed` flakes on `~screen-order-success` (RN wrapper has no drawn pixels) | The locator already falls back to `~btn-order-details` for iOS in `orderSuccessScreen.mobile.ios` |
| Deep-link `orderId` fetch on mobile is fire-and-forget; screen may render before `lastOrder` lands, causing `orderDetailsLabel` / `orderIdLabel` checks to flake | If observed, replace presence checks with text-content waits (poll for non-empty value) — see follow-up #5 |
| `GET /api/orders/{order_id}` slow on Render free-tier cold start | 90 s budget on `orderSuccessScreen` wait absorbs cold-start latency, matching `checkout-order.molecule.ts` precedent |
| i18n drift in OmniPizza repo breaks the Examples table without warning | Manual reconciliation; build-time check against `frontend-mobile/src/i18n/locales/*.json` is future work |

## 10. Out-of-scope follow-ups (tracked, not delivered)

1. Visual snapshot suite for the success screen (`order_success.visual.json`).
2. `order-success-localization.feature` — full i18n coverage of every translated string on the screen (current spec only covers two).
3. `order_id` / `total` numeric assertions — mobile screen does not expose `order-id` / `order-total` testIDs; web does. Could add a `@desktop @responsive` scenario that reads the rendered `order-id` text and compares to `world.placedOrderId`.
4. Negative paths (payment rejection, `GET /api/orders/{order_id}` 404, courier-fetch failure).
5. Race-condition coverage: the mobile `useDeepLinkParams.ts:117-128` fires `getOrder` fire-and-forget. If the screen renders before the fetch resolves, asserts on order-details could flake. If observed, add an explicit wait for `orderDetailsLabel` content (not just presence).

## 11. Acceptance criteria

- [ ] `pnpm test` with no tag filter runs `order-success.feature` end-to-end without errors under the default driver.
- [ ] All 5 example rows pass under `DRIVER=playwright` (web), `DRIVER=mobilewright` (mobile/Playwright), and `DRIVER=appium` (Android + iOS).
- [ ] Running with `DRIVER=api` is an unsupported configuration for this feature (success screen is UI-only). The route raises a clear error at the first UI step rather than silently passing.
- [ ] No new locator-key collisions reported by the proxy on startup.
- [ ] No regressions in `place-delivery-order.feature` or `invalid-credentials.feature`.

## 12. Next step

Hand off to the `writing-plans` skill to produce a step-by-step implementation plan covering: files to create, order of work, test-driven approach for each new step binding, and any incremental locator/visual changes.
