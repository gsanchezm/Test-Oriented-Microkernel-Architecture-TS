// Navbar route.
//
// Owns world mutation; delegates UI work to navbar molecules. The navbar
// slice is a UI SHELL — there is NO backend endpoint for it, hence no
// DAO, no @api scenarios, and no api-branch alternative implementation.
// The api driver still runs through the route so a future api-only run
// logs cleanly and the slice stays uniform with login/checkout patterns.
//
// World fields touched here:
//   - `world.locale` — { market, language } chosen when landing on catalog.
//   - `world.languageOverride` — set to the *target* language after a
//     successful header-language switch. The visual hook reads
//     `world.languageOverride ?? world.locale?.language` for bucketing,
//     so the post-switch snapshot lands under the new language directory.

import { logger } from '@utils/logger';
import type { CheckoutWorld } from '@core/tests/support/world';
import {
    openCatalogScreen,
    assertDesktopNavbarVisible,
    openMobileMenu,
    assertMobileMenuEntries,
    type LanguageCode,
    type MarketCode,
} from '@core/tests/navbar/molecules/navbar-shell.molecule';
import {
    switchHeaderLanguage,
    assertAddToCartLabelReflects,
    type CHLanguageCode,
} from '@core/tests/navbar/molecules/navbar-language.molecule';

const log = logger.child({ layer: 'route', domain: 'navbar' });

type Driver = 'playwright' | 'appium' | 'mobilewright' | 'api';

const SUPPORTED_MARKETS: ReadonlyArray<MarketCode> = ['US', 'MX', 'CH', 'JP'];
const SUPPORTED_LANGUAGES: ReadonlyArray<LanguageCode> = ['en', 'es', 'de', 'fr', 'ja'];

export class NavbarRoute {
    constructor(private readonly world: CheckoutWorld) {}

    // -- step intents -------------------------------------------------

    /**
     * Lands on the catalog screen with the chosen market + language.
     * Persists both in `world.locale` so the visual hook can bucket
     * snapshots per (market, language).
     */
    async openCatalog(market: string, language: string): Promise<void> {
        const marketCode = this.validateMarket(market);
        const languageCode = this.validateLanguage(language);
        log.info({ market: marketCode, language: languageCode, driver: this.driver }, 'Opening catalog');

        this.world.locale = { market: marketCode, language: languageCode };

        // Clear any prior override — a fresh openCatalog resets the
        // post-switch state so subsequent scenarios don't inherit a stale
        // languageOverride across the cucumber world (which is shared
        // within a scenario only, but the field hygiene is still clearer).
        this.world.languageOverride = undefined;

        const token = this.world.auth?.token ?? '';
        // No token guard: under DRIVER=playwright the login route only
        // populates `world.auth.token` when run via the api branch. The
        // navbar slice's seed step pre-fills localStorage with whatever
        // token is present; '' is acceptable for UI-only scenarios that
        // don't actually call protected endpoints.
        await openCatalogScreen({
            market: marketCode,
            language: languageCode,
            accessToken: token,
        });
    }

    /**
     * Verifies the four navbar affordances are visible. UI-only step;
     * api driver self-skips inside the molecule.
     */
    async verifyDesktopNavbar(): Promise<void> {
        log.info({ driver: this.driver }, 'Verifying desktop navbar affordances');
        await assertDesktopNavbarVisible();
    }

    /**
     * Opens the mobile navigation menu. On web-responsive the hamburger
     * is clicked; on native mobile this is a presence check on the
     * always-visible bottom nav.
     */
    async openMobileMenu(): Promise<void> {
        log.info({ driver: this.driver }, 'Opening mobile navigation menu');
        await openMobileMenu();
    }

    /**
     * Verifies the mobile menu carries the navigation entries. On native
     * mobile the logout entry is omitted (logout lives on the profile
     * screen, not in the bottom nav) — the molecule logs the skip.
     */
    async verifyMobileMenuEntries(): Promise<void> {
        log.info({ driver: this.driver }, 'Verifying mobile menu entries');
        await assertMobileMenuEntries();
    }

    /**
     * Switches the header language (CH-only flow). Persists the *target*
     * language in `world.languageOverride` so:
     *   - the visual hook's bucket reflects the post-switch state,
     *   - any downstream cross-slice reads can recover the intended locale.
     */
    async switchLanguage(targetLanguage: string): Promise<void> {
        const lang = this.validateCHLanguage(targetLanguage);
        const market = this.world.locale?.market;
        if (market && market !== 'CH') {
            // The feature file restricts this step to CH, but keep the
            // guard explicit so a future scenario row in another market
            // fails with a clear error instead of a silent no-op click.
            throw new Error(
                `[navbar:route] Header language switcher is CH-only; current market is "${market}".`,
            );
        }
        log.info(
            { targetLanguage: lang, market, driver: this.driver },
            'Switching header language',
        );
        await switchHeaderLanguage(lang);

        // Persist target language for visual bucketing + downstream reads.
        this.world.languageOverride = lang;
        // Keep `locale.language` in sync as well — both are read by the
        // visual hook in slightly different orders, and an in-place update
        // here means the next scenario's setup starts from a clean state.
        if (this.world.locale) {
            this.world.locale = { ...this.world.locale, language: lang };
        }
    }

    /**
     * Cross-slice assertion of the language switch: the catalog's
     * add-to-cart button text must reflect the post-switch translation.
     * Read happens inside the molecule (EVALUATE on web, READ_TEXT on
     * native mobile via a templated witness selector).
     */
    async verifyAddToCartLabel(expected: string): Promise<void> {
        log.info({ expected, driver: this.driver }, 'Verifying catalog add-to-cart label after switch');
        await assertAddToCartLabelReflects(expected);
    }

    // -- internals ----------------------------------------------------

    private get driver(): Driver {
        return (process.env.DRIVER ?? 'playwright') as Driver;
    }

    private validateMarket(market: string): MarketCode {
        const code = market.toUpperCase() as MarketCode;
        if (!SUPPORTED_MARKETS.includes(code)) {
            throw new Error(
                `[navbar:route] Unsupported market "${market}". Supported: ${SUPPORTED_MARKETS.join(', ')}`,
            );
        }
        return code;
    }

    private validateLanguage(language: string): LanguageCode {
        const code = language.toLowerCase() as LanguageCode;
        if (!SUPPORTED_LANGUAGES.includes(code)) {
            throw new Error(
                `[navbar:route] Unsupported language "${language}". Supported: ${SUPPORTED_LANGUAGES.join(', ')}`,
            );
        }
        return code;
    }

    private validateCHLanguage(language: string): CHLanguageCode {
        const code = language.toLowerCase();
        if (code !== 'de' && code !== 'fr') {
            throw new Error(
                `[navbar:route] Header language switcher only supports "de" or "fr"; got "${language}".`,
            );
        }
        return code;
    }
}
