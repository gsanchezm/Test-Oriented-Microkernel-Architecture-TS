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
 * Clears any active search / category filter. The live OmniPizza FE does
 * not currently ship a `clear-filters-desktop` testid (confirmed via a DOM
 * probe on 2026-05-22 — `search-pizza-desktop` is present but no clear
 * button has a testid). The reactive grid restores the full catalog as
 * soon as the search input is empty, so we emulate the clear by blanking
 * the search input on every driver instead of clicking a dedicated affordance.
 *
 * If/when the FE ships a `clear-filters-<viewport>` testid, switch back to
 * `INTENT.CLICK clearFiltersButton` for the web path so category filters
 * (which a search-only clear doesn't touch) are reset too.
 */
export async function clearAllFilters(): Promise<void> {
    const driver = (process.env.DRIVER ?? 'playwright').toLowerCase();
    if (driver === 'api') {
        log.info({ driver }, 'Catalog clear-filters no-op (api driver)');
        return;
    }
    await sendIntent(INTENT.CLEAR_TEXT, 'searchInput');
}
