import { sendIntent } from '@kernel/client';
import { INTENT } from '@kernel/intents';
import { logger } from '@utils/logger';

const log = logger.child({ layer: 'molecule', action: 'catalog-card' });

const BUILDER_WAIT_TIMEOUT_MS = 15_000;

/**
 * Clicks a pizza card to open the builder. The locator contract carries a
 * templated `pizzaCard` key (`pizza-card-{id}-desktop` / `card-pizza-{id}`);
 * the resolver returns the literal template, so the molecule substitutes
 * `{id}` here.
 *
 * `pizzaId` is the backend's pizza id (a lowercase slug like `pepperoni`).
 * The route's caller looks up the id from the catalog DAO before calling
 * this molecule, so the card click is keyed on the same id the API uses.
 */
export async function openPizzaCard(pizzaId: string): Promise<void> {
    const driver = (process.env.DRIVER ?? 'playwright').toLowerCase();
    if (driver === 'api') {
        log.info({ pizzaId, driver }, 'Open pizza card no-op (api driver)');
        return;
    }
    const id = pizzaId.toLowerCase();
    const selector = isMobileDriver()
        ? `~card-pizza-${id}`
        : viewportAwareWebCardSelector(id);
    await sendIntent(INTENT.CLICK, selector);
}

/**
 * Verifies the pizza builder rendered for the requested item. There is no
 * builder locator in the catalog contract (the builder is owned by a
 * separate slice that hasn't shipped), so the assertion is URL-shaped:
 *
 *  - web: the SPA's builder route is `/pizza/<id>`; we INTENT.EVALUATE
 *    `window.location.href` and assert the id is in the URL. Mirrors the
 *    debug probes navigateToCheckout uses.
 *  - mobile: the builder is a screen; we wait for any screen-pizza-* node
 *    via the templated selector. We don't have a single accessibility id
 *    we can pin to the item (would require a new locator outside scope),
 *    so the assertion degenerates to "some pizza screen is up".
 */
export async function assertBuilderOpen(pizzaId: string): Promise<void> {
    const driver = (process.env.DRIVER ?? 'playwright').toLowerCase();
    const id = pizzaId.toLowerCase();
    if (driver === 'appium' || driver === 'mobilewright') {
        const probe = `~screen-pizza-${id}`;
        await sendIntent(INTENT.WAIT_FOR_ELEMENT, `${probe}||${BUILDER_WAIT_TIMEOUT_MS}`);
        return;
    }
    // Web: probe the URL for the pizza id. Use EVALUATE since READ_TEXT
    // expects a locator, not a window property.
    const result = await sendIntent(INTENT.EVALUATE, 'window.location.href');
    const href = (result.payload ?? '').toLowerCase();
    if (!href.includes(id)) {
        throw new Error(
            `[catalog] pizza builder URL did not contain "${id}". Current: ${href}`,
        );
    }
}

// -- helpers ----------------------------------------------------------------

function isMobileDriver(): boolean {
    const driver = (process.env.DRIVER ?? 'playwright').toLowerCase();
    return driver === 'appium' || driver === 'mobilewright';
}

/**
 * The web pizza-card locator splits per viewport (`pizza-card-{id}-desktop`
 * vs `pizza-card-{id}-responsive`). The resolver applies the viewport
 * dimension for non-templated keys; here we apply it manually because
 * we're substituting `{id}` into the raw selector before sending.
 */
function viewportAwareWebCardSelector(id: string): string {
    const viewport = (process.env.VIEWPORT ?? 'desktop').toLowerCase();
    const suffix = viewport === 'responsive' ? 'responsive' : 'desktop';
    return `[data-testid='pizza-card-${id}-${suffix}']`;
}
