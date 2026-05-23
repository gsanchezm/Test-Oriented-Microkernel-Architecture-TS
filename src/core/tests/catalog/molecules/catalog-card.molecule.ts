import { sendIntent } from '@kernel/client';
import { INTENT } from '@kernel/intents';
import { logger } from '@utils/logger';

const log = logger.child({ layer: 'molecule', action: 'catalog-card' });

const BUILDER_WAIT_TIMEOUT_MS = 15_000;

/**
 * Triggers the customizer modal for a pizza. The pizza card itself is not
 * the modal trigger on web — its `add-to-cart-<id>-<viewport>` CTA button is
 * (confirmed with OmniPizza on 2026-05-22: PizzaCustomizerModal opens from
 * the catalog's add-to-cart button; the card body has no click handler).
 * Mobile keeps the card-tap behavior since the native screen is the entry.
 *
 * `pizzaId` is the backend's pizza id — an opaque cross-market identifier
 * (`p01`..`p12` in current builds). Ids are intentionally opaque and stable
 * across markets/languages; the route's caller looks the id up from
 * `/api/pizzas`. Do not derive ids from the display name.
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
        : viewportAwareAddToCartSelector(id);
    await sendIntent(INTENT.CLICK, selector);
}

/**
 * Verifies the pizza builder rendered for the requested item.
 *
 *  - web: the customizer is a modal (`PizzaCustomizerModal`, opened from
 *    /catalog — confirmed by OmniPizza on 2026-05-22; there is no
 *    /customizer route). Wait for the modal's confirm CTA, which only mounts
 *    once the modal is open. The locator key `confirmAddToCartButton` lives
 *    in the pizzaBuilder contract; the proxy resolves it across slices.
 *  - mobile: the builder is a native screen; we wait for the templated
 *    `screen-pizza-<id>` node. There is no single accessibility id pinned to
 *    the item, so this degenerates to "some pizza screen is up".
 */
export async function assertBuilderOpen(pizzaId: string): Promise<void> {
    const driver = (process.env.DRIVER ?? 'playwright').toLowerCase();
    if (driver === 'appium' || driver === 'mobilewright') {
        const probe = `~screen-pizza-${pizzaId.toLowerCase()}`;
        await sendIntent(INTENT.WAIT_FOR_ELEMENT, `${probe}||${BUILDER_WAIT_TIMEOUT_MS}`);
        return;
    }
    await sendIntent(INTENT.WAIT_FOR_ELEMENT, `confirmAddToCartButton||${BUILDER_WAIT_TIMEOUT_MS}`);
}

// -- helpers ----------------------------------------------------------------

function isMobileDriver(): boolean {
    const driver = (process.env.DRIVER ?? 'playwright').toLowerCase();
    return driver === 'appium' || driver === 'mobilewright';
}

/**
 * The web add-to-cart locator splits per viewport
 * (`add-to-cart-{id}-desktop` vs `add-to-cart-{id}-responsive`). The
 * resolver applies the viewport dimension for non-templated keys; here we
 * apply it manually because we're substituting `{id}` into the raw selector
 * before sending.
 */
function viewportAwareAddToCartSelector(id: string): string {
    const viewport = (process.env.VIEWPORT ?? 'desktop').toLowerCase();
    const suffix = viewport === 'responsive' ? 'responsive' : 'desktop';
    return `[data-testid='add-to-cart-${id}-${suffix}']`;
}
