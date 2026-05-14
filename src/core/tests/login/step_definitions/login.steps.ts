import { After, Given, Then, When, setDefaultTimeout } from '@cucumber/cucumber';
import { LoginRoute } from '@core/tests/login/organisms/login.route';
import type { CheckoutWorld } from '@core/tests/support/world';

setDefaultTimeout(120_000);

function route(world: unknown): LoginRoute {
    return new LoginRoute(world as CheckoutWorld);
}

Given('the OmniPizza login screen is open', async function () {
    await route(this).openLoginScreen();
});

When(
    'the user selects the {string} market with language {string}',
    async function (market: string, language: string) {
        await route(this).selectMarketWithLanguage(market, language);
    },
);

//remove
When('the user selects the {string} market', async function (market: string) {
    await route(this).selectMarket(market);
});

When('they log in as {string}', async function (userAlias: string) {
    await route(this).loginAs(userAlias);
});

Then('the welcome title is {string}', async function (expected: string) {
    await route(this).verifyWelcomeTitle(expected);
});

Then('the subtitle is {string}', async function (expected: string) {
    await route(this).verifySubtitle(expected);
});

Then('the logout button label is {string}', async function (expected: string) {
    await route(this).verifyLogoutLabel(expected);
});

After(async function () {
    try {
        await route(this).resetClientState();
    } catch {
        // Proxy may not be running (e.g. DAO-only test runs).
    }
});
