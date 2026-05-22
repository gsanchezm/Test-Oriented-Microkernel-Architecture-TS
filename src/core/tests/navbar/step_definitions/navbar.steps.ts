// Navbar step bindings.
//
// The Background step `Given the OmniPizza user is logged in as "..."` is
// registered by checkout.steps.ts (and reused by order_success.steps.ts)
// and shared via cucumber's global step registry — we deliberately do NOT
// redeclare it here.

import { Given, Then, When, setDefaultTimeout } from '@cucumber/cucumber';
import { NavbarRoute } from '@core/tests/navbar/organisms/navbar.route';
import type { CheckoutWorld } from '@core/tests/support/world';

// Same budget as the other slices — covers cold WDA build + Render free-tier
// latency on the first scenario; subsequent scenarios reuse the session.
setDefaultTimeout(600_000);

function route(world: unknown): NavbarRoute {
    return new NavbarRoute(world as CheckoutWorld);
}

Given(
    'they are on the catalog screen in market {string} using language {string}',
    async function (market: string, language: string) {
        await route(this).openCatalog(market, language);
    },
);

Then(
    'the navbar logo, catalog, checkout, and profile links are visible',
    async function () {
        await route(this).verifyDesktopNavbar();
    },
);

When('they open the mobile navigation menu', async function () {
    await route(this).openMobileMenu();
});

Then(
    'the mobile menu shows catalog, checkout, profile, and logout entries',
    async function () {
        await route(this).verifyMobileMenuEntries();
    },
);

When(
    'they switch the header language to {string}',
    async function (targetLanguage: string) {
        await route(this).switchLanguage(targetLanguage);
    },
);

Then(
    'the catalog add-to-cart label reflects {string}',
    async function (expectedLabel: string) {
        await route(this).verifyAddToCartLabel(expectedLabel);
    },
);
