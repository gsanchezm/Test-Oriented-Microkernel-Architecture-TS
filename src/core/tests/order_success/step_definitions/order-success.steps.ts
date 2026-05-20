import { Given, Then, When, setDefaultTimeout } from '@cucumber/cucumber';
import { OrderSuccessRoute } from '@core/tests/order_success/organisms/order-success.route';
import type { CheckoutWorld } from '@core/tests/support/world';

// Same budget as checkout.steps.ts — covers cold WDA build + Render free-tier
// place-order latency on the first scenario; subsequent scenarios reuse the
// session and finish well inside this window.
setDefaultTimeout(600_000);

function route(world: unknown): OrderSuccessRoute {
    return new OrderSuccessRoute(world as CheckoutWorld);
}

// Background login step (`Given the OmniPizza user is logged in as "..."`) is
// registered by checkout.steps.ts and shared via cucumber's global step
// registry — no need to re-declare here.

Given(
    'a placed order exists in market {string} using language {string}',
    async function (market: string, language: string) {
        await route(this).createPlacedOrder(market, language);
    },
);

When('they open the order success screen', async function () {
    await route(this).openSuccessScreen();
});

Then(
    'the order success screen is fully displayed with status {string}',
    async function (expectedStatus: string) {
        await route(this).verifyScreenAndStatus(expectedStatus);
    },
);

Then(
    'the tracking information, courier details, and order details {string} are visible',
    async function (expectedOrderDetails: string) {
        await route(this).verifyTrackingAndDetails(expectedOrderDetails);
    },
);
