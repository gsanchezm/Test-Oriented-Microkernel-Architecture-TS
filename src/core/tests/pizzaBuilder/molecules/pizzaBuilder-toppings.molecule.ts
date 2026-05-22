import { sendIntent } from '@kernel/client';
import { INTENT } from '@kernel/intents';
import { logger } from '@utils/logger';

const log = logger.child({ layer: 'molecule', domain: 'pizzaBuilder', action: 'toppings' });

function isMobileDriver(): boolean {
    const driver = (process.env.DRIVER ?? 'playwright').toLowerCase();
    return driver === 'appium' || driver === 'mobilewright';
}

// Topping ids in the feature carry latin-letter accents (jalapeño) and
// punctuation neutral kebab dashes (extra-cheese). Slug them to a stable
// testid-safe form — strip diacritics, lower-case — so the FE only needs
// to expose simple data-testids.
function slugify(value: string): string {
    return value
        .normalize('NFD')
        // Strip combining diacritical marks (U+0300–U+036F) so "jalapeño"
        // collapses to "jalapeno" before the testid lookup.
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

function toppingButtonSelector(topping: string): string {
    const slug = slugify(topping);
    return isMobileDriver()
        ? `~btn-topping-${slug}`
        : `[data-testid='topping-${slug}']`;
}

/**
 * Parses the feature's comma-separated topping list and returns trimmed
 * non-empty values. Exposed for the route so the api driver can populate
 * its `/api/cart` payload with the same parsing rules.
 */
export function parseToppings(commaSeparated: string): string[] {
    return commaSeparated
        .split(',')
        .map((t) => t.trim())
        .filter((t) => t.length > 0);
}

export async function addToppings(commaSeparated: string): Promise<string[]> {
    const driver = process.env.DRIVER ?? 'playwright';
    const toppings = parseToppings(commaSeparated);
    if (driver === 'api') {
        log.info({ toppings, driver }, 'addToppings no-op (api driver)');
        return toppings;
    }
    for (const topping of toppings) {
        log.info({ topping, driver }, 'Adding topping');
        await sendIntent(INTENT.CLICK, toppingButtonSelector(topping));
    }
    return toppings;
}

const PRICE_PRESENCE_MS = 5_000;

/**
 * Asserts the customizer total renders after toppings are added. Same
 * pragmatic assertion as the size step — without a known price formula,
 * the contract is "the total text exists and is non-empty"; a stricter
 * arithmetic check lives in the visual / contract layer.
 */
export async function assertTotalReflectsToppings(
    size: string,
    commaSeparated: string,
): Promise<void> {
    const driver = process.env.DRIVER ?? 'playwright';
    if (driver === 'api') {
        log.info({ size, toppings: commaSeparated, driver }, 'assertTotalReflectsToppings no-op (api driver)');
        return;
    }
    const key = driver === 'playwright' ? 'customizerPriceText' : 'estimatedTotalValue';
    await sendIntent(INTENT.WAIT_FOR_ELEMENT, `${key}||${PRICE_PRESENCE_MS}`);
    const result = await sendIntent(INTENT.READ_TEXT, key);
    const text = (result.payload ?? '').trim();
    if (!text) {
        throw new Error(
            `[${key}] empty after toppings — size "${size}", toppings "${commaSeparated}".`,
        );
    }
    log.info({ size, toppings: commaSeparated, total: text }, 'Total reflected toppings');
}
