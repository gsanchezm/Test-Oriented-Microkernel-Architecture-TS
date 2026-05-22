import { sendIntent } from '@kernel/client';
import { INTENT } from '@kernel/intents';
import { logger } from '@utils/logger';

const log = logger.child({ layer: 'molecule', action: 'catalog-search' });

/**
 * Types a query into the catalog search box. The locator key `searchInput`
 * resolves to the desktop or responsive variant at runtime via the locator
 * resolver's `viewport` strategy; the molecule just hands the logical key
 * through. Self-skips under the api driver so the route's DAO branch owns
 * the assertion path.
 */
export async function typeSearchQuery(query: string): Promise<void> {
    const driver = (process.env.DRIVER ?? 'playwright').toLowerCase();
    if (driver === 'api') {
        log.info({ query, driver }, 'Catalog search no-op (api driver)');
        return;
    }
    // CLEAR_TEXT is web/mobile UI; safe on either platform. We clear before
    // typing because successive scenarios may leave residual text in the
    // search input when the after-hook reset hasn't re-rendered the page.
    await sendIntent(INTENT.CLEAR_TEXT, 'searchInput');
    await sendIntent(INTENT.TYPE, `searchInput||${query}`);
}

/**
 * Clears any active search / category filter via the catalog's "clear
 * filters" affordance. Mobile carries no explicit clear affordance in the
 * locator contract, so on mobile we simply clear the search input. Web
 * uses the `clearFiltersButton`.
 */
export async function clearAllFilters(): Promise<void> {
    const driver = (process.env.DRIVER ?? 'playwright').toLowerCase();
    if (driver === 'api') {
        log.info({ driver }, 'Catalog clear-filters no-op (api driver)');
        return;
    }
    if (driver === 'appium' || driver === 'mobilewright') {
        // No clearFiltersButton in the mobile locator contract — emulate by
        // emptying the search input. The mobile catalog re-renders the full
        // grid as soon as the search query is empty.
        await sendIntent(INTENT.CLEAR_TEXT, 'searchInput');
        return;
    }
    await sendIntent(INTENT.CLICK, 'clearFiltersButton');
}
