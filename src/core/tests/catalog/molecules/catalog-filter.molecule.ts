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
    if (driver === 'appium' && platform === 'android') {
        // The category pills are a horizontally-scrollable list; `meat`/`sides`
        // sit off-screen to the right. Two steps, because a
        // `UiScrollable(...).scrollIntoView(...)` selector used directly as the
        // CLICK target taps the scrollable container/centre pill rather than the
        // wanted one — that mis-tap is why JP (wider labels shift the layout)
        // landed on the wrong category and showed the wrong cards. So: (1)
        // resolve the UiScrollable selector via WAIT_FOR_ELEMENT to SCROLL the
        // pill into view (no click), scoped to `view-category-pills` by
        // resourceId (the rebuilt app instruments it via getTestProps), then
        // (2) tap the pill directly by its own accessibility id.
        const scrollSel = `android=new UiScrollable(new UiSelector().resourceId("view-category-pills").scrollable(true))`
            + `.setAsHorizontalList().scrollIntoView(new UiSelector().description("btn-category-${id}"))`;
        await sendIntent(INTENT.WAIT_FOR_ELEMENT, `${scrollSel}||8000`);
        await sendIntent(INTENT.CLICK, `~btn-category-${id}`);
        return;
    }
    const selector = isMobileDriver()
        ? `~btn-category-${id}`
        : `[data-testid='category-${id}']`;
    await sendIntent(INTENT.CLICK, selector);
}

function isMobileDriver(): boolean {
    const driver = (process.env.DRIVER ?? 'playwright').toLowerCase();
    return driver === 'appium' || driver === 'mobilewright';
}
