import { logger } from '@utils/logger';
import { CheckoutDao } from '@core/tests/checkout/dao/checkout.dao';
import type { CountryCode, CountryInfo } from '@core/tests/checkout/dao/checkout.types';
import { PizzaBuilderDao } from '@core/tests/pizzaBuilder/dao/pizzaBuilder.dao';
import {
    openPizzaBuilder,
    verifySizeAndToppingsRendered,
    verifyPriceAndConfirmVisible,
    assertSectionLabels,
    assertEstimatedTotalLabel,
    type LanguageCode,
} from '@core/tests/pizzaBuilder/molecules/pizzaBuilder-open.molecule';
import {
    selectSize,
    assertTotalReflectsSize,
} from '@core/tests/pizzaBuilder/molecules/pizzaBuilder-size.molecule';
import {
    addToppings,
    parseToppings,
    assertTotalReflectsToppings,
} from '@core/tests/pizzaBuilder/molecules/pizzaBuilder-toppings.molecule';
import {
    clickConfirmAddToCart,
    assertBuilderClosed,
    assertNavbarCartCount,
} from '@core/tests/pizzaBuilder/molecules/pizzaBuilder-confirm.molecule';
import type { CheckoutWorld } from '@core/tests/support/world';

const log = logger.child({ layer: 'route', domain: 'pizzaBuilder' });

type Driver = 'playwright' | 'appium' | 'mobilewright' | 'api';

// Per-scenario state local to the pizza-builder route. We deliberately do
// NOT add new fields to CheckoutWorld for builder-only state — the world
// already carries auth + orderContext (market, etc.), so we hang the
// builder draft off the world via a typed extension below.
interface BuilderDraft {
    pizzaId: string;
    itemName: string;
    size?: string;
    toppings: string[];
}

// CheckoutWorld is a plain interface; we extend it locally via a typed cast
// to store the builder draft without touching world.ts (out of scope).
interface PizzaBuilderWorldShape extends CheckoutWorld {
    pizzaBuilderDraft?: BuilderDraft;
    pizzaBuilderCartCount?: number;
}

export class PizzaBuilderRoute {
    private readonly dao: PizzaBuilderDao;
    private readonly checkoutDao: CheckoutDao;

    constructor(private readonly world: PizzaBuilderWorldShape) {
        this.dao = new PizzaBuilderDao();
        this.checkoutDao = new CheckoutDao();
    }

    // -- step intents --------------------------------------------------

    /**
     * Atomic builder entry. Resolves the item name → id via /api/pizzas,
     * stamps the orderContext with market metadata (so the visual hook can
     * bucket by market/language), seeds web persisted stores (mobile
     * deep-link, web localStorage), and lands on the customizer.
     *
     * If the api driver is active, UI is skipped; only the world state
     * (auth, orderContext, draft) is prepped so the confirm step can POST
     * directly to /api/cart.
     */
    async openBuilder(item: string, marketRaw: string, languageRaw: string): Promise<void> {
        const market = marketRaw.toUpperCase() as CountryCode;
        const language = languageRaw.toLowerCase() as LanguageCode;
        const { token } = this.requireAuth();

        // Hydrate country metadata so the visual hook + downstream steps
        // have orderContext.market populated (mirrors checkout.setMarket).
        const country = await this.fetchCountry(market);

        const pizzaId = await this.dao.resolvePizzaId({
            token,
            countryCode: market,
            itemName: item,
            language,
        });

        this.world.orderContext = {
            market,
            countryInfo: country,
            availableLanguages: country.languages,
            requiredFields: country.required_fields,
            currency: country.currency,
            currencySymbol: country.currency_symbol,
            item,
            size: '',
            qty: 1,
            pizzaId,
            pizzaName: item,
            unitPrice: 0,
            cartItems: [],
        };
        this.world.languageOverride = language;
        this.world.locale = { market, language };
        this.world.pizzaBuilderDraft = { pizzaId, itemName: item, toppings: [] };

        log.info({ market, language, item, pizzaId, driver: this.driver }, 'Opening pizza builder');

        await openPizzaBuilder({
            market,
            language,
            pizzaId,
            itemName: item,
            accessToken: token,
        });
    }

    async verifyBuilderRendered(): Promise<void> {
        if (this.driver === 'api') {
            log.info({ driver: this.driver }, 'verifyBuilderRendered skipped (api driver)');
            return;
        }
        await verifySizeAndToppingsRendered();
        await verifyPriceAndConfirmVisible();
    }

    async verifyPriceAndConfirm(): Promise<void> {
        if (this.driver === 'api') {
            log.info({ driver: this.driver }, 'verifyPriceAndConfirm skipped (api driver)');
            return;
        }
        await verifyPriceAndConfirmVisible();
    }

    async verifySectionLabels(sizeSection: string, toppingsSection: string): Promise<void> {
        if (this.driver === 'api') {
            log.info({ driver: this.driver, sizeSection, toppingsSection }, 'verifySectionLabels skipped (api driver)');
            return;
        }
        // On web the section labels are not surfaced via dedicated testids in
        // this contract — `sectionSizeText` and `sectionToppingsText` are
        // mobile-only keys. Self-skip on web so the scenario keeps its
        // mobile assertion power without forcing a web equivalent that
        // doesn't exist yet in the FE.
        if (this.driver === 'playwright') {
            log.info({ driver: this.driver, sizeSection, toppingsSection }, 'verifySectionLabels skipped on web');
            return;
        }
        await assertSectionLabels(sizeSection, toppingsSection);
    }

    async verifyTotalLabel(expected: string): Promise<void> {
        if (this.driver === 'api') {
            log.info({ driver: this.driver, expected }, 'verifyTotalLabel skipped (api driver)');
            return;
        }
        await assertEstimatedTotalLabel(expected);
    }

    async selectSize(size: string): Promise<void> {
        const draft = this.requireDraft();
        draft.size = size;
        if (this.world.orderContext) {
            this.world.orderContext.size = size;
        }
        log.info({ size, driver: this.driver }, 'Selecting size');
        await selectSize(size);
    }

    async verifyTotalReflectsSize(size: string): Promise<void> {
        if (this.driver === 'api') {
            log.info({ driver: this.driver, size }, 'verifyTotalReflectsSize skipped (api driver)');
            return;
        }
        await assertTotalReflectsSize(size);
    }

    async addToppings(commaSeparated: string): Promise<void> {
        const draft = this.requireDraft();
        const parsed = await addToppings(commaSeparated);
        draft.toppings = parsed;
        log.info({ toppings: parsed, driver: this.driver }, 'Toppings recorded');
        if (this.driver === 'api') {
            // Even under api we record toppings on the draft — the confirm
            // step posts them to /api/cart via the DAO.
            draft.toppings = parseToppings(commaSeparated);
        }
    }

    async verifyTotalReflectsToppings(size: string, toppings: string): Promise<void> {
        if (this.driver === 'api') {
            log.info({ driver: this.driver, size, toppings }, 'verifyTotalReflectsToppings skipped (api driver)');
            return;
        }
        await assertTotalReflectsToppings(size, toppings);
    }

    /**
     * Asserts the navbar cart count is the expected string.
     *
     * The feature uses this step BOTH as a precondition (initialCount before
     * confirm) AND as a postcondition (expectedCount after confirm) — single
     * binding handles both. Under api the cart count is read from /api/cart;
     * the navbar is a UI surface, not part of the api contract.
     */
    async assertCartCount(expected: string): Promise<void> {
        if (this.driver === 'api') {
            const { token } = this.requireAuth();
            const market = this.requireMarket();
            const cart = await this.dao.getCart({ token, countryCode: market });
            const actualCount = (cart.cart_items ?? []).reduce(
                (sum, line) => sum + (line.quantity ?? 0),
                0,
            );
            this.world.pizzaBuilderCartCount = actualCount;
            if (actualCount !== Number(expected)) {
                throw new Error(
                    `[api cart count] expected ${expected}, got ${actualCount} ` +
                    `for market "${market}".`,
                );
            }
            return;
        }
        await assertNavbarCartCount(expected);
    }

    async confirmAddToCart(): Promise<void> {
        log.info({ driver: this.driver }, 'Confirm add to cart');
        if (this.driver === 'api') {
            await this.confirmAddToCartViaApi();
            return;
        }
        await clickConfirmAddToCart();
    }

    async verifyBuilderClosed(): Promise<void> {
        if (this.driver === 'api') {
            log.info({ driver: this.driver }, 'verifyBuilderClosed skipped (api driver)');
            return;
        }
        await assertBuilderClosed();
    }

    // -- internals -----------------------------------------------------

    private get driver(): Driver {
        return (process.env.DRIVER ?? 'playwright') as Driver;
    }

    private requireAuth(): { token: string } {
        const token = this.world.auth?.token;
        if (!token) {
            throw new Error(
                'Missing auth token — Background "logged in as" step must run first. ' +
                'Note: the api driver requires DRIVER=api during the login step too so ' +
                'the LoginDao (not the UI molecule) sets the token.',
            );
        }
        return { token };
    }

    private requireMarket(): CountryCode {
        const market = this.world.orderContext?.market;
        if (!market) {
            throw new Error('Missing market — run openBuilder first.');
        }
        return market;
    }

    private requireDraft(): BuilderDraft {
        const draft = this.world.pizzaBuilderDraft;
        if (!draft) {
            throw new Error('Missing pizza-builder draft — run openBuilder first.');
        }
        return draft;
    }

    private async fetchCountry(market: CountryCode): Promise<CountryInfo> {
        const countries = await this.checkoutDao.getCountries();
        const country = countries.find((c) => c.code === market);
        if (!country) {
            const supported = countries.map((c) => c.code).join(', ');
            throw new Error(`Unsupported market "${market}". Supported: ${supported}`);
        }
        return country;
    }

    /**
     * API path for the confirm step: posts the customized line to /api/cart
     * with the same `{pizza_id, size, toppings, quantity}` shape the load
     * simulation uses. The backend returns the enriched cart; we stash the
     * count on the world so a follow-up assertCartCount under api can pass
     * without an extra round-trip.
     */
    private async confirmAddToCartViaApi(): Promise<void> {
        const { token } = this.requireAuth();
        const market = this.requireMarket();
        const draft = this.requireDraft();
        if (!draft.size) {
            throw new Error('Cannot confirm — size not selected. Run selectSize first.');
        }
        const response = await this.dao.addCustomizedToCart({
            token,
            countryCode: market,
            items: [{
                pizza_id: draft.pizzaId,
                size: draft.size,
                toppings: draft.toppings,
                quantity: 1,
            }],
        });
        const count = (response.cart_items ?? []).reduce(
            (sum, line) => sum + (line.quantity ?? 0),
            0,
        );
        this.world.pizzaBuilderCartCount = count;
        log.info({
            market,
            count,
            pizzaId: draft.pizzaId,
            size: draft.size,
            toppings: draft.toppings,
        }, 'Customized line added via /api/cart');
    }
}
