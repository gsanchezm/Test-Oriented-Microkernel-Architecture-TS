import { sendIntent } from '@kernel/client';
import { INTENT } from '@kernel/intents';
import { logger } from '@utils/logger';

const log = logger.child({ layer: 'molecule', action: 'catalog-card' });

const BUILDER_WAIT_TIMEOUT_MS = 15_000;

/**
 * Triggers the customizer for a pizza. On BOTH web and mobile the trigger is
 * the card's add ("+") button, not the card body:
 *  - web: the `add-to-cart-<id>-<viewport>` CTA opens PizzaCustomizerModal
 *    (confirmed with OmniPizza on 2026-05-22: the card body has no click
 *    handler).
 *  - mobile: tapping `~btn-add-pizza-<id>` opens the native pizza-builder
 *    screen (`~screen-pizza-builder`). Verified on-device 2026-05-28: the
 *    card body has no handler and `omnipizza://customizer` has no deep-link
 *    route, so the add button is the only builder entry point.
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
        ? `~btn-add-pizza-${id}`
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
 *  - mobile: the builder is a native screen with a single, item-agnostic
 *    container id `~screen-pizza-builder` (verified on-device 2026-05-28 —
 *    there is no per-id `screen-pizza-<id>` node). We wait for that.
 */
export async function assertBuilderOpen(pizzaId: string): Promise<void> {
    const driver = (process.env.DRIVER ?? 'playwright').toLowerCase();
    if (driver === 'appium' || driver === 'mobilewright') {
        log.info({ pizzaId, driver }, 'Verifying builder open (mobile)');
        await sendIntent(INTENT.WAIT_FOR_ELEMENT, `~screen-pizza-builder||${BUILDER_WAIT_TIMEOUT_MS}`);
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
