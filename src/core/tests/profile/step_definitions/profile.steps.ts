import { Given, Then, When, setDefaultTimeout } from '@cucumber/cucumber';
import { ProfileRoute } from '@core/tests/profile/organisms/profile.route';
import type { CheckoutWorld } from '@core/tests/support/world';

// Mirrors the other slices — 600s window covers Render free-tier cold starts
// plus iOS WDA cold builds on the first scenario; subsequent scenarios reuse
// the session and finish well inside this window.
setDefaultTimeout(600_000);

function route(world: unknown): ProfileRoute {
    return new ProfileRoute(world as CheckoutWorld);
}

// Background `Given the OmniPizza user is logged in as "standard_user"` is
// registered by checkout.steps.ts and shared via cucumber's global step
// registry — DO NOT re-declare here (collisions throw at boot).

Given(
    'they are on the profile screen in market {string} using language {string}',
    async function (market: string, language: string) {
        await route(this).openProfile(market, language);
    },
);

Then(
    'the profile card shows username {string} and the premium badge is visible',
    async function (user: string) {
        await route(this).verifyProfileCard(user);
    },
);

Then('the full name, phone, address, and notes inputs are visible', async function () {
    await route(this).verifyFormInputsVisible();
});

Then(
    'the form labels {string}, {string}, {string}, {string} are visible',
    async function (fullNameLabel: string, phoneLabel: string, addressLabel: string, notesLabel: string) {
        await route(this).verifyFormLabels({
            fullName: fullNameLabel,
            phone: phoneLabel,
            address: addressLabel,
            notes: notesLabel,
        });
    },
);

When(
    'they update the profile with full name {string}, phone {string}, address {string}, notes {string}',
    async function (fullName: string, phone: string, address: string, notes: string) {
        await route(this).updateProfileFields({ fullName, phone, address, notes });
    },
);

When('they save the profile', async function () {
    await route(this).saveProfile();
});

When('they reload the profile screen', async function () {
    await route(this).reloadProfile();
});

Then(
    'the profile fields show full name {string}, phone {string}, address {string}, notes {string}',
    async function (fullName: string, phone: string, address: string, notes: string) {
        await route(this).verifyProfileFields({ fullName, phone, address, notes });
    },
);

Then(
    'the profile API reports full name {string}, phone {string}, address {string}, notes {string}',
    async function (fullName: string, phone: string, address: string, notes: string) {
        await route(this).verifyProfileApi({ fullName, phone, address, notes });
    },
);
