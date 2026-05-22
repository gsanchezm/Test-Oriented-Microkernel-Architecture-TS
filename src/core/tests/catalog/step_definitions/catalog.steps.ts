import { Given, Then, When, setDefaultTimeout } from '@cucumber/cucumber';
import { CatalogRoute } from '@core/tests/catalog/organisms/catalog.route';
import type { CheckoutWorld } from '@core/tests/support/world';

// Same budget as checkout/order_success — covers cold WDA build + Render
// free-tier latency on the first scenario. Subsequent scenarios reuse the
// session and finish well inside this window.
setDefaultTimeout(600_000);

function route(world: unknown): CatalogRoute {
    return new CatalogRoute(world as CheckoutWorld);
}

// Background login step (`Given the OmniPizza user is logged in as "..."`)
// is registered by checkout.steps.ts and shared via cucumber's global step
// registry — no need to re-declare here.

Given(
    'they are browsing the catalog in market {string} using language {string}',
    async function (market: string, language: string) {
        await route(this).browseCatalog(market, language);
    },
);

Then('the catalog screen is fully displayed', async function () {
    await route(this).verifyCatalogDisplayed();
});

Then(
    'the add-to-cart label {string} is visible on a pizza card',
    async function (label: string) {
        await route(this).verifyAddToCartLabel(label);
    },
);

Then('the section title {string} is visible', async function (title: string) {
    await route(this).verifySectionTitle(title);
});

When('they search the catalog for {string}', async function (query: string) {
    await route(this).searchCatalog(query);
});

Then(
    'only pizzas whose name contains {string} remain visible',
    async function (query: string) {
        await route(this).verifySearchResults(query);
    },
);

When('they clear the catalog filters', async function () {
    await route(this).clearFilters();
});

Then('the full pizza grid is restored', async function () {
    await route(this).verifyFullGridRestored();
});

When('they select the {string} category', async function (category: string) {
    await route(this).selectCategory(category);
});

Then(
    'only pizzas in category {string} are visible',
    async function (category: string) {
        await route(this).verifyCategoryFilter(category);
    },
);

When('they open the pizza {string}', async function (item: string) {
    await route(this).openPizza(item);
});

Then('the pizza builder is displayed for {string}', async function (item: string) {
    await route(this).verifyBuilderDisplayed(item);
});
