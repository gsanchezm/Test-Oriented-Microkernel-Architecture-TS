import { sendIntent } from '@kernel/client';
import { INTENT } from '@kernel/intents';
import { logger } from '@utils/logger';

const log = logger.child({ layer: 'molecule', domain: 'pizzaBuilder', action: 'size' });

const SUPPORTED_SIZES = ['Small', 'Medium', 'Large', 'Family'] as const;

function isMobileDriver(): boolean {
    const driver = (process.env.DRIVER ?? 'playwright').toLowerCase();
    return driver === 'appium' || driver === 'mobilewright';
}

// `sizeOptionsList` is a list contract — disambiguate per element by
// kebab-cased suffix. Mirror of the login slice's marketButtonSelector.
function sizeButtonSelector(size: string): string {
    const slug = size.toLowerCase();
    return isMobileDriver()
        ? `~btn-size-${slug}`
        : `[data-testid='size-${slug}']`;
}

export async function selectSize(size: string): Promise<void> {
    const driver = process.env.DRIVER ?? 'playwright';
    if (driver === 'api') {
        log.info({ size, driver }, 'selectSize no-op (api driver)');
        return;
    }
    if (!SUPPORTED_SIZES.includes(size as typeof SUPPORTED_SIZES[number])) {
        throw new Error(`Unsupported size "${size}". Supported: ${SUPPORTED_SIZES.join(', ')}`);
    }
    log.info({ size, driver }, 'Selecting size');
    await sendIntent(INTENT.CLICK, sizeButtonSelector(size));
}

const PRICE_PRESENCE_MS = 5_000;

/**
 * Asserts that the customizer total reflects a price for the selected size.
 * Without a stable formula (the price depends on market + base pizza), we
 * settle for: the price text is present and non-empty after the click.
 * Stronger assertions (currency symbol per market, etc.) belong in a
 * dedicated visual / contract test.
 */
export async function assertTotalReflectsSize(size: string): Promise<void> {
    const driver = process.env.DRIVER ?? 'playwright';
    if (driver === 'api') {
        log.info({ size, driver }, 'assertTotalReflectsSize no-op (api driver)');
        return;
    }
    const key = driver === 'playwright' ? 'customizerPriceText' : 'estimatedTotalValue';
    await sendIntent(INTENT.WAIT_FOR_ELEMENT, `${key}||${PRICE_PRESENCE_MS}`);
    const result = await sendIntent(INTENT.READ_TEXT, key);
    const text = (result.payload ?? '').trim();
    if (!text) {
        throw new Error(`[${key}] empty after selecting size "${size}" — total didn't render.`);
    }
    log.info({ size, total: text }, 'Total reflected size selection');
}
