import { sendIntent } from '@kernel/client';
import { INTENT } from '@kernel/intents';
import { logger } from '@utils/logger';

const log = logger.child({ layer: 'molecule', action: 'catalog-filter' });

/**
 * Clicks a category chip in the catalog header. The locator contract carries
 * a templated `categoryById` key (`btn-category-{id}` on mobile,
 * `[data-testid='category-{id}']` on web); the resolver returns the literal
 * template, so the molecule substitutes `{id}` here and hands the raw
 * selector to the proxy. Mirrors how login-market.molecule.ts builds
 * `btn-market-{code}` selectors at runtime.
 */
export async function selectCategory(categoryId: string): Promise<void> {
    const driver = (process.env.DRIVER ?? 'playwright').toLowerCase();
    if (driver === 'api') {
        log.info({ categoryId, driver }, 'Category filter no-op (api driver)');
        return;
    }
    const id = categoryId.toLowerCase();
    const platform = (process.env.PLATFORM ?? '').toLowerCase();
    let selector: string;
    if (driver === 'appium' && platform === 'android') {
        // The category pills are a horizontally-scrollable list; `meat`/`sides`
        // sit off-screen to the right (verified on-device 2026-05-28 — only
        // all/popular/veggie are initially rendered). Scroll the wanted pill
        // into view before tapping, scoped to the `view-category-pills`
        // HorizontalScrollView so we don't grab the vertical catalog scroller.
        selector = `android=new UiScrollable(new UiSelector().description("view-category-pills").scrollable(true))`
            + `.setAsHorizontalList().scrollIntoView(new UiSelector().description("btn-category-${id}"))`;
    } else if (isMobileDriver()) {
        selector = `~btn-category-${id}`;
    } else {
        selector = `[data-testid='category-${id}']`;
    }
    await sendIntent(INTENT.CLICK, selector);
}

function isMobileDriver(): boolean {
    const driver = (process.env.DRIVER ?? 'playwright').toLowerCase();
    return driver === 'appium' || driver === 'mobilewright';
}
