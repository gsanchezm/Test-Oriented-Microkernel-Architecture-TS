import { After, AfterAll, Given, Then, When, setDefaultTimeout } from '@cucumber/cucumber';
import { closeClient, sendIntent } from '@kernel/client';
import { CheckoutRoute } from '@core/tests/checkout/routes/checkout.route';
import type { CheckoutWorld } from '@core/tests/support/world';

// 10 min covers a cold WDA build on first scenario (~5 min) plus the place-order
// API roundtrip on Render free tier; subsequent scenarios reuse the session.
setDefaultTimeout(600_000);

function route(world: unknown): CheckoutRoute {
    return new CheckoutRoute(world as CheckoutWorld);
}

Given('the OmniPizza user is logged in as {string}', async function (userAlias: string) {
    await route(this).loginAs(userAlias);
});

Given('they are ordering in market {string}', async function (market: string) {
    await route(this).setMarket(market);
});

Given(
    'they have an order with {string} size {string} quantity {int}',
    async function (item: string, size: string, qty: number) {
        await route(this).addToOrder(item, size, qty);
    },
);

When(
    'they provide delivery details {string} {string}, {string} for {string} {string}',
    async function (street: string, zip: string, suburb: string, name: string, phone: string) {
        await route(this).fillDelivery(
            { street, zip, suburb: suburb || undefined },
            { name, phone },
        );
    },
);

When('they choose payment method {string}', async function (method: string) {
    await route(this).selectPayment(method);
});

When(
    'they enter card details {string} expiration {string} cvv {string}',
    async function (card: string, exp: string, cvv: string) {
        await route(this).enterCard(card, exp, cvv);
    },
);

Then('the order is accepted', async function () {
    await route(this).verifyOrderAccepted();
});

After(async function () {
    try {
        await route(this).resetClientState();
    } catch {
        // Proxy may not be running (e.g. DAO-only test runs).
    }
});

AfterAll(async function () {
    try {
        await sendIntent('TEARDOWN', '');
    } catch {
        // no-op
    }
    closeClient();
});
