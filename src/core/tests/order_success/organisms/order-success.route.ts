import { logger } from '@utils/logger';
import { CheckoutRoute } from '@core/tests/checkout/organisms/checkout.route';
import { CheckoutDao } from '@core/tests/checkout/dao/checkout.dao';
import type {
    CheckoutRequest,
    CountryCode,
    CountryInfo,
} from '@core/tests/checkout/dao/checkout.types';
import type { CheckoutWorld } from '@core/tests/support/world';
import {
    openOrderSuccess,
    waitForSuccessScreen,
    verifyLiveTrackingBadgeVisible,
    verifyEstimatedDeliveryTimeVisible,
    verifyCourierCardVisible,
    verifyViewOrderDetailsButtonVisible,
    assertStatusTitleContains,
    assertOrderDetailsLabelContains,
    type LanguageCode,
} from '@core/tests/order_success/molecules/order-success-screen.molecule';

const log = logger.child({ layer: 'route', domain: 'order_success' });

// Fixed test data per market. Mirrors place-delivery-order.feature so the
// success screen test stays aligned with the broader checkout matrix; vary
// only when a market-specific quirk would otherwise mask a regression.
interface OrderFixture {
    item: string;
    size: string;
    qty: number;
    street: string;
    zip: string;
    suburb?: string;
    name: string;
    phone: string;
    card: string;
    exp: string;
    cvv: string;
}

const ORDER_FIXTURES: Record<CountryCode, OrderFixture> = {
    US: {
        item: 'Pepperoni',  size: 'Large',  qty: 1,
        street: '123 Luxury Avenue', zip: '90210',
        name: 'Julian Casablancas',  phone: '+1 415 555 0101',
        card: '4242 4242 4242 4242', exp: '12/28', cvv: '123',
    },
    MX: {
        item: 'Margherita', size: 'Medium', qty: 1,
        street: 'Av. Carranza 123',  zip: '78230', suburb: 'Polanco',
        name: 'Guillermo Alcantara', phone: '+52 55 1234 5678',
        card: '4242 4242 4242 4242', exp: '12/28', cvv: '123',
    },
    CH: {
        item: 'Marinara',   size: 'Small',  qty: 1,
        street: 'Bahnhofstrasse 12', zip: '8001',
        name: 'Lukas Baumgartner',   phone: '+41 44 668 18 00',
        card: '4242 4242 4242 4242', exp: '12/28', cvv: '123',
    },
    JP: {
        item: 'Pepperoni',  size: 'Family', qty: 1,
        street: '1-2-3 Shibuya',     zip: '150-0002', suburb: 'Tokyo',
        name: '田中 健太',           phone: '+81 3 1234 5678',
        card: '4242 4242 4242 4242', exp: '12/28', cvv: '123',
    },
};

export class OrderSuccessRoute {
    private readonly checkoutRoute: CheckoutRoute;
    private readonly checkoutDao: CheckoutDao;

    constructor(private readonly world: CheckoutWorld) {
        this.checkoutRoute = new CheckoutRoute(world);
        this.checkoutDao = new CheckoutDao();
    }

    // -- step intents --------------------------------------------------

    /**
     * Pure DAO placement: setMarket → addToOrder (cart hydration via API) →
     * placeOrder. No UI is touched. Captures the resulting order_id in the
     * world so openSuccessScreen can deep-link to it.
     */
    async createPlacedOrder(market: string, language: string): Promise<void> {
        const countryCode = market.toUpperCase() as CountryCode;
        const lang = language.toLowerCase() as LanguageCode;
        const fixture = ORDER_FIXTURES[countryCode];
        if (!fixture) {
            throw new Error(`No ORDER_FIXTURES entry for market "${market}".`);
        }

        log.info({ market: countryCode, language: lang }, 'Creating placed order via DAO');

        await this.checkoutRoute.setMarket(countryCode);
        await this.checkoutRoute.addToOrder(fixture.item, fixture.size, fixture.qty);

        const { token, country, pizzaId } = this.requireApiState();
        const body = this.buildCheckoutRequest(countryCode, country, pizzaId, fixture);

        const result = await this.checkoutDao.placeOrder({
            token,
            countryCode,
            body,
        });
        if (!result.order_id) {
            throw new Error(
                `placeOrder DAO returned no order_id for market "${countryCode}". ` +
                `Response: ${JSON.stringify(result)}`,
            );
        }

        log.info(
            { orderId: result.order_id, status: result.status, total: result.total },
            'Order placed via DAO',
        );

        this.world.placedOrderId = result.order_id;
        this.world.languageOverride = lang;
        this.world.checkoutResult = result;
    }

    /**
     * Lands directly on the order-success screen via deep link (mobile) or
     * pre-seeded localStorage + NAVIGATE (web). Waits for the screen to
     * render before returning.
     */
    async openSuccessScreen(): Promise<void> {
        const { token } = this.requireAuth();
        const orderId = this.world.placedOrderId;
        if (!orderId) {
            throw new Error('Missing placedOrderId — createPlacedOrder must run first.');
        }
        const market = this.world.orderContext?.market;
        if (!market) {
            throw new Error('Missing market — createPlacedOrder must run first.');
        }
        const language = this.world.languageOverride ?? 'en';

        await openOrderSuccess({ market, language, accessToken: token, orderId });
        await waitForSuccessScreen();
    }

    /**
     * Verifies the success screen rendered and the localized status title
     * contains the expected copy (case-insensitive substring).
     */
    async verifyScreenAndStatus(expectedStatus: string): Promise<void> {
        await assertStatusTitleContains(expectedStatus);
    }

    /**
     * Verifies tracking + courier card + order-details label are visible,
     * with the order-details label text containing the expected copy
     * (case-insensitive substring).
     */
    async verifyTrackingAndDetails(expectedOrderDetails: string): Promise<void> {
        await verifyLiveTrackingBadgeVisible();
        await verifyEstimatedDeliveryTimeVisible();
        await verifyCourierCardVisible();
        await assertOrderDetailsLabelContains(expectedOrderDetails);
        await verifyViewOrderDetailsButtonVisible();
    }

    // -- internals -----------------------------------------------------

    private requireAuth(): { token: string } {
        const token = this.world.auth?.token;
        if (!token) {
            throw new Error('Missing auth token — Background login step did not run.');
        }
        return { token };
    }

    private requireApiState(): { token: string; country: CountryInfo; pizzaId: string } {
        const { token } = this.requireAuth();
        const ctx = this.world.orderContext;
        if (!ctx) {
            throw new Error('Missing orderContext — setMarket + addToOrder must run first.');
        }
        if (!ctx.pizzaId) {
            throw new Error('Missing pizzaId — addToOrder must run first.');
        }
        return { token, country: ctx.countryInfo, pizzaId: ctx.pizzaId };
    }

    /**
     * Builds the checkout request body, mapping the fixture's address into
     * the country-specific zip-shaped field. Mirrors the logic in
     * CheckoutRoute.submitOrderViaApi so the request payloads stay
     * consistent across the two routes.
     */
    private buildCheckoutRequest(
        market: CountryCode,
        country: CountryInfo,
        pizzaId: string,
        fixture: OrderFixture,
    ): CheckoutRequest {
        // Backend (FastAPI / Pydantic) expects `payment_method` as the literal
        // 'card' or 'cash' since the recent contract change — not the
        // user-facing labels shown in the UI ("Credit Card" / "Cash"). The
        // UI path posts through its own form and gets translated at submit
        // time; here we drive the API directly, so use the machine value.
        const body: CheckoutRequest = {
            country_code: market,
            items: [{ pizza_id: pizzaId, size: fixture.size, quantity: fixture.qty }],
            name: fixture.name,
            address: fixture.street,
            phone: fixture.phone,
            payment_method: 'card',
        };

        for (const field of country.required_fields ?? []) {
            if (field === 'colonia')         body.colonia    = fixture.suburb;
            else if (field === 'prefectura') body.prefectura = fixture.suburb ?? fixture.zip;
            else if (field === 'plz')        body.plz        = fixture.zip;
            else if (field === 'zip_code')   body.zip_code   = fixture.zip;
        }

        body.card_number = fixture.card;
        body.card_expiry = fixture.exp;
        body.card_cvv    = fixture.cvv;

        if (country.tip_field) {
            body[country.tip_field] = 0;
        }

        return body;
    }
}
