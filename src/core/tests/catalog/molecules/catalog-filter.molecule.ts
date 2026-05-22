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
    const selector = isMobileDriver()
        ? `~btn-category-${id}`
        : `[data-testid='category-${id}']`;
    await sendIntent(INTENT.CLICK, selector);
}

function isMobileDriver(): boolean {
    const driver = (process.env.DRIVER ?? 'playwright').toLowerCase();
    return driver === 'appium' || driver === 'mobilewright';
}
