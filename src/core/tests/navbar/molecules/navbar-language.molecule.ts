// Navbar header-language molecule.
//
// CH is the only market with a header language switcher (DE/FR). The
// navbar.locators.json defines BOTH a `languageDEButton` / `languageFRButton`
// pair (used on the login screen and visible in the header on web) and a
// `headerLanguageDEButton` / `headerLanguageFRButton` pair specific to the
// mobile header. We pick the right key by driver.
//
// The verification step `Then the catalog add-to-cart label reflects "<x>"`
// is intentionally cross-slice: switching the navbar language must drive
// the catalog to re-render with the new translations. Rather than couple
// to a catalog molecule that doesn't yet exist (the catalog slice's
// molecules/ folder is empty), we read the add-to-cart label here.
//
// Implementation notes for that read:
//   - Catalog's `addToCartButton` locator embeds a literal `{id}` token —
//     it's NOT runtime-interpolated; the locator-resolver passes unknown
//     keys through as raw selectors. So we cannot READ_TEXT on the bare
//     key for an arbitrary pizza.
//   - Web (playwright): use EVALUATE to query any matching add-to-cart
//     button by its `[data-testid^='add-to-cart-']` prefix and read its
//     textContent. This is platform-neutral across markets/pizzas.
//   - Native mobile (appium / mobilewright): the bottom-strip switch
//     fires only on CH scenarios. We bind to a known CH pizza (Marinara,
//     id `marinara` — matches order_success fixtures) by templating the
//     mobile `addToCartLabel` selector ourselves and passing the raw
//     selector through the locator-resolver fallback.

import { sendIntent } from '@kernel/client';
import { logger } from '@utils/logger';
import { INTENT } from '@kernel/intents';
import { getDriver, isApiDriver, isNativeMobileDriver, isWebDriver } from './navbar-shell.molecule';

const log = logger.child({ layer: 'molecule', domain: 'navbar', action: 'language' });

const POST_SWITCH_RENDER_WAIT_MS = 8_000;

// CH-only target languages — the header switcher exposes DE and FR.
export type CHLanguageCode = 'de' | 'fr';

// The CH catalog reliably ships Marinara across all OmniPizza markets that
// stock it (see order_success ORDER_FIXTURES). We use it as the witness
// pizza for the post-switch label read on native mobile only.
const CH_WITNESS_PIZZA_ID = 'marinara';

// -- switcher click ---------------------------------------------------

/**
 * Clicks the header language switcher button matching `targetLanguage`.
 *
 * Self-skips on api driver.
 *
 * Locator key selection:
 *   - native mobile: `headerLanguageDEButton` / `headerLanguageFRButton`
 *     (RN's in-app header, distinct from the login-screen switcher).
 *   - web (desktop or responsive): `languageDEButton` / `languageFRButton`
 *     (the navbar surfaces the same testid set as the login screen).
 *
 * Waits briefly for a re-render anchor (`catalogScreen`) after the click
 * so downstream catalog reads don't race the i18n re-flow.
 */
export async function switchHeaderLanguage(targetLanguage: CHLanguageCode): Promise<void> {
    if (isApiDriver()) {
        log.info({ targetLanguage }, 'switchHeaderLanguage skipped (api driver)');
        return;
    }

    const key = pickLanguageButtonKey(targetLanguage);
    log.info({ targetLanguage, driver: getDriver(), locatorKey: key }, 'Switching header language');
    await sendIntent(INTENT.CLICK, key);
    // The catalog screen stays mounted while i18n re-renders. Wait for the
    // anchor to be present (no-op when it already is) and add a brief
    // settle window so the new translations are committed before the
    // assertion reads them.
    await sendIntent(INTENT.WAIT_FOR_ELEMENT, `catalogScreen||${POST_SWITCH_RENDER_WAIT_MS}`);
}

function pickLanguageButtonKey(lang: CHLanguageCode): string {
    if (isNativeMobileDriver()) {
        return lang === 'fr' ? 'headerLanguageFRButton' : 'headerLanguageDEButton';
    }
    // Web (playwright, both desktop and responsive viewports). The login
    // and navbar share `languageDEButton` / `languageFRButton` testids,
    // and the locator JSON serves the same data-testid for both.
    return lang === 'fr' ? 'languageFRButton' : 'languageDEButton';
}

// -- cross-slice catalog assertion ------------------------------------

/**
 * Asserts that the catalog's add-to-cart button label reflects the
 * post-switch language. This is the navbar slice's verification of the
 * language switcher's side effect, kept localized here per the slice
 * design notes (avoids importing a catalog molecule that doesn't exist).
 *
 * Self-skips on api driver.
 */
export async function assertAddToCartLabelReflects(expected: string): Promise<void> {
    if (isApiDriver()) {
        log.info({ expected }, 'assertAddToCartLabelReflects skipped (api driver)');
        return;
    }

    const actual = await readAddToCartLabel();
    if (!actual.toLowerCase().includes(expected.toLowerCase())) {
        throw new Error(
            `[navbar:language] add-to-cart label mismatch — expected to contain "${expected}", ` +
            `got "${actual}" (driver=${getDriver()}).`,
        );
    }
}

async function readAddToCartLabel(): Promise<string> {
    if (isWebDriver()) {
        // EVALUATE script: find the first add-to-cart button, return its
        // accessible text. Falls back gracefully to '' so the assertion
        // produces a clear diff instead of a JS-level throw.
        const script = `
            (() => {
                const el = document.querySelector("[data-testid^='add-to-cart-']");
                if (!el) return '';
                // Prefer textContent (covers both <button>label</button> and
                // wrappers); innerText would respect CSS visibility and
                // sometimes returns '' under headless.
                return (el.textContent || '').trim();
            })()
        `;
        const result = await sendIntent(INTENT.EVALUATE, script);
        return (result.payload ?? '').trim();
    }

    if (isNativeMobileDriver()) {
        // The locator file's `addToCartLabel` mobile selector is
        // `~text-add-pizza-{id}` — `{id}` is literal, not interpolated by
        // the resolver. Build the raw accessibility-id locally and pass
        // it through; locator-resolver passes unknown keys/raw selectors
        // through with a warning.
        const rawSelector = `~text-add-pizza-${CH_WITNESS_PIZZA_ID}`;
        const result = await sendIntent(INTENT.READ_TEXT, rawSelector);
        return (result.payload ?? '').trim();
    }

    // Shouldn't reach here — api was already short-circuited.
    return '';
}
