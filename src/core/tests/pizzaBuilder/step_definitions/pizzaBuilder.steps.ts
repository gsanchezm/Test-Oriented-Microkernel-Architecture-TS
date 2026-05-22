import { Given, Then, When, setDefaultTimeout } from '@cucumber/cucumber';
import { PizzaBuilderRoute } from '@core/tests/pizzaBuilder/organisms/pizzaBuilder.route';
import type { CheckoutWorld } from '@core/tests/support/world';

// Same budget as checkout/order-success — covers cold WDA build + Render
// free-tier latency on the first scenario; subsequent scenarios reuse the
// session and finish well inside this window.
setDefaultTimeout(600_000);

function route(world: unknown): PizzaBuilderRoute {
    return new PizzaBuilderRoute(world as CheckoutWorld);
}

// The Background step `Given the OmniPizza user is logged in as "..."` is
// registered by checkout.steps.ts and shared via cucumber's global step
// registry — do NOT re-declare here (would cause MultipleStepDefinitionsFound).

Given(
    'the pizza builder is open for {string} in market {string} using language {string}',
    async function (item: string, market: string, language: string) {
        await route(this).openBuilder(item, market, language);
    },
);

Then('the size options and topping options are rendered', async function () {
    await route(this).verifyBuilderRendered();
});

Then('the customizer price and confirm-add-to-cart affordance are visible', async function () {
    await route(this).verifyPriceAndConfirm();
});

Then(
    'the section labels {string} and {string} are visible',
    async function (sizeSection: string, toppingsSection: string) {
        await route(this).verifySectionLabels(sizeSection, toppingsSection);
    },
);

Then('the estimated total label {string} is visible', async function (totalLabel: string) {
    await route(this).verifyTotalLabel(totalLabel);
});

When('they select size {string}', async function (size: string) {
    await route(this).selectSize(size);
});

Then('the estimated total reflects the price of size {string}', async function (size: string) {
    await route(this).verifyTotalReflectsSize(size);
});

When('they add toppings {string}', async function (commaSeparated: string) {
    await route(this).addToppings(commaSeparated);
});

Then(
    'the estimated total reflects size {string} plus toppings {string}',
    async function (size: string, toppings: string) {
        await route(this).verifyTotalReflectsToppings(size, toppings);
    },
);

// Single binding handles both pre-confirm (initialCount, often "0") and
// post-confirm (expectedCount) assertions — cucumber matches by step text,
// not by keyword, so this one Then-binding catches every `And the navbar
// cart count is "..."` in the feature.
Then('the navbar cart count is {string}', async function (count: string) {
    await route(this).assertCartCount(count);
});

When('they confirm add to cart', async function () {
    await route(this).confirmAddToCart();
});

Then('the pizza builder is closed', async function () {
    await route(this).verifyBuilderClosed();
});
