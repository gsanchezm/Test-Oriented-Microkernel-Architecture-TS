import { sendIntent } from '@kernel/client';
import { logger } from '@utils/logger';
import { UsersDataSource } from '@core/test-data/users.data-source';
import { LoginDao } from '@core/tests/login/dao/login.dao';
import { CheckoutDao } from '@core/tests/checkout/dao/checkout.dao';
import type {
    CartItemResponse,
    CheckoutRequest,
    CheckoutResponse,
    CountryCode,
    CountryInfo,
} from '@core/tests/checkout/dao/checkout.types';
import {
    injectBrowserSession,
    BrowserSessionState,
} from '@core/tests/checkout/molecules/checkout-session.molecule';
import { navigateToCheckout } from '@core/tests/checkout/molecules/checkout-navigation.molecule';
import {
    fillDeliveryAddress,
    fillContactInfo,
    SecondaryAddressField,
} from '@core/tests/checkout/molecules/checkout-address.molecule';
import {
    selectPaymentMethod,
    fillCardDetails,
} from '@core/tests/checkout/molecules/checkout-payment.molecule';
import {
    placeOrder,
    verifyOrderAccepted as verifyOrderOnUI,
} from '@core/tests/checkout/molecules/checkout-order.molecule';
import type { CheckoutWorld } from '@core/tests/support/world';
import { INTENT } from '@kernel/intents';

const log = logger.child({ layer: 'route', domain: 'checkout' });

// -- types --

export type Driver = 'playwright' | 'appium' | 'mobilewright' | 'api';

export interface DeliveryAddress {
    street: string;
    zip: string;
    suburb?: string;
}

export interface ContactDetails {
    name: string;
    phone: string;
}

// -- form-field routing tables --
//
// On any market the mobile UI renders a single TextInput (testID `input-zipcode`)
// for the market-specific address field, regardless of backend name (zip_code /
// plz / prefectura). We pick which feature-file column fills that slot based on
// the country's required_fields.
const ZIP_SLOT_PRIMARY_BY_FIELD: Record<string, 'zip' | 'suburb'> = {
    prefectura: 'suburb',
};

// Fields that are rendered alongside the zipcode slot in the checkout form.
// Today only MX's `colonia` lives there. JP's `prefectura` is NOT a secondary
// — it replaces the zip in the single market-specific address slot.
const SECONDARY_ADDRESS_FIELDS = new Set(['colonia']);

// -- route --

export class CheckoutRoute {
    private readonly users: UsersDataSource;
    private readonly login: LoginDao;
    private readonly checkout: CheckoutDao;

    constructor(private readonly world: CheckoutWorld) {
        this.users = new UsersDataSource();
        this.login = new LoginDao();
        this.checkout = new CheckoutDao();
    }

    // -- step intents --

    async loginAs(userAlias: string): Promise<void> {
        log.info({ userAlias }, 'Logging in user');
        const user = await this.users.getUser(userAlias);

        const loginResponse = await this.login.login({
            username: user.username,
            email: user.email,
            password: user.password,
        });

        const token = this.login.extractToken(loginResponse);
        if (!token) throw new Error(`Login failed for "${userAlias}". No token received.`);

        log.info({ userAlias, behavior: user.behavior }, 'Login successful');

        this.world.auth = {
            userAlias,
            username: user.username,
            password: user.password,
            behavior: user.behavior,
            token,
            loginResponse,
        };
    }

    async setMarket(market: string): Promise<void> {
        log.info({ market }, 'Selecting market');
        const countries = await this.checkout.getCountries();
        if (!countries?.length) {
            throw new Error('Countries API returned empty response. Verify API_BASE_URL and /api/countries.');
        }

        const country = countries.find((c) => c.code === market);
        if (!country) {
            const supported = countries.map((c) => c.code).join(', ');
            throw new Error(`Unsupported market "${market}". Supported: ${supported}`);
        }
        if (!country.currency || !country.currency_symbol) {
            throw new Error(`Market "${market}" is missing currency configuration.`);
        }

        log.info({ market, requiredFields: country.required_fields }, 'Market selected');

        this.world.orderContext = {
            market: country.code,
            countryInfo: country,
            availableLanguages: country.languages,
            requiredFields: country.required_fields,
            currency: country.currency,
            currencySymbol: country.currency_symbol,
            item: '',
            size: '',
            qty: 0,
            pizzaId: '',
            pizzaName: '',
            unitPrice: 0,
            cartItems: [],
        };
    }

    async addToOrder(item: string, size: string, qty: number): Promise<void> {
        const { token, market } = this.requireAuthAndMarket('order setup');

        log.info({ market, item, size, qty }, 'Fetching pizzas');
        const pizzas = await this.checkout.getPizzas({ token, countryCode: market });
        if (!pizzas?.length) {
            throw new Error(`Pizzas API empty for market "${market}". Verify /api/pizzas.`);
        }

        const pizza = pizzas.find((p) => p.name.toLowerCase() === item.toLowerCase());
        if (!pizza) {
            const available = pizzas.map((p) => p.name).join(', ');
            throw new Error(`Pizza "${item}" not found for "${market}". Available: ${available}`);
        }
        if (!pizza.id || pizza.price <= 0) {
            throw new Error(`Pizza "${item}" has invalid data: id="${pizza.id}", price=${pizza.price}`);
        }

        log.info({ pizzaId: pizza.id, pizzaName: pizza.name, price: pizza.price }, 'Pizza selected');

        // $S_0$ state injection via API (faster than UI cart manipulation).
        await this.checkout.addToCart({
            token,
            countryCode: market,
            items: [{ pizza_id: pizza.id, size, quantity: qty }],
        });

        // POST only stores IDs; GET enriches with unit_price and pizza object.
        const enriched = await this.checkout.getCart({ token, countryCode: market });
        const enrichedItems = enriched.cart_items;

        const ctx = this.world.orderContext!;
        this.world.orderContext = {
            ...ctx,
            item,
            size,
            qty,
            pizzaId: pizza.id,
            pizzaName: pizza.name,
            unitPrice: enrichedItems[0]?.unit_price ?? pizza.price,
            cartItems: enrichedItems,
        };
    }

    async fillDelivery(address: DeliveryAddress, contact: ContactDetails): Promise<void> {
        const { token, market } = this.requireAuthAndMarket('delivery');
        const ctx = this.world.orderContext!;

        log.info({ ...address, ...contact, driver: this.driver }, 'Filling delivery details');

        // Persist for the api branch, which submits via CheckoutDao in verifyOrderAccepted.
        this.world.deliveryAddress = address;
        this.world.contact = contact;

        if (this.driver === 'api') return;

        const auth = this.world.auth!;
        const session: BrowserSessionState = {
            token,
            username: auth.username,
            password: auth.password,
            countryCode: market,
            cartItems: ctx.cartItems,
            countryInfo: ctx.countryInfo,
        };

        // Routes know which plugin runs each leg:
        // - injectBrowserSession: playwright only (mobile/api skip via DRIVER check inside the molecule)
        // - navigateToCheckout / fill*: playwright or appium (chosen by chaos-proxy from DRIVER)
        await injectBrowserSession(session);
        await navigateToCheckout(market, token);

        const zipSlot = this.pickZipSlot(ctx.countryInfo, address);
        const secondary = this.pickSecondaryAddressField(ctx.countryInfo, address.suburb);

        await fillDeliveryAddress(address.street, zipSlot, secondary);
        await fillContactInfo(contact.name, contact.phone);
    }

    async selectPayment(method: string): Promise<void> {
        log.info({ method, driver: this.driver }, 'Selecting payment method');
        this.world.payment = { ...this.world.payment, method };
        if (this.driver === 'api') return;
        await selectPaymentMethod(method);
    }

    async enterCard(card: string, exp: string, cvv: string): Promise<void> {
        log.info({ cardLastFour: card.slice(-4), driver: this.driver }, 'Entering card details');
        this.world.payment = {
            ...this.world.payment,
            method: this.world.payment?.method ?? 'Credit Card',
            cardNumber: card,
            cardExpiry: exp,
            cardCvv: cvv,
        };
        if (this.driver === 'api') return;
        await fillCardDetails(card, exp, cvv, this.world.contact?.name);
    }

    async verifyOrderAccepted(): Promise<void> {
        const country = this.world.orderContext?.countryInfo;
        if (!country) throw new Error('Missing country metadata. Run market step before verification.');

        log.info({ market: country.code, driver: this.driver }, 'Verifying order acceptance');

        if (this.driver === 'api') {
            this.world.checkoutResult = await this.submitOrderViaApi(country);
            return;
        }

        await placeOrder();
        await verifyOrderOnUI(country, this.world.orderContext!.cartItems);
    }

    // -- lifecycle --

    // Reset strategies dispatched by DRIVER env. Adding a new driver = add an entry,
    // no conditional to extend (Open/Closed).
    private readonly resetStrategies: Record<Driver, () => Promise<void>> = {
        // App auth state lives in Zustand — clear via deep link, which returns to Login.
        'appium': async () => {
            await sendIntent(INTENT.DEEP_LINK, 'omnipizza://login?resetSession=true');
        },
        'mobilewright': async () => {
            await sendIntent(INTENT.DEEP_LINK, 'omnipizza://login?resetSession=true');
        },
        'playwright': async () => {
            const baseUrl = process.env.BASE_URL;
            if (!baseUrl) return; // nothing to navigate to; safe no-op
            await sendIntent(INTENT.EVALUATE, 'localStorage.clear(); sessionStorage.clear()');
            await sendIntent(INTENT.NAVIGATE, baseUrl);
        },
        // No client state to clear for pure API runs.
        'api': async () => { /* noop */ },
    };

    /** Reset client-side state between scenarios. Plugin chosen by DRIVER env. */
    async resetClientState(): Promise<void> {
        await this.resetStrategies[this.driver]();
    }

    // -- internals --

    private get driver(): Driver {
        return (process.env.DRIVER ?? 'playwright') as Driver;
    }

    private requireAuthAndMarket(stage: string): { token: string; market: CountryCode } {
        const token = this.world.auth?.token;
        if (!token) throw new Error(`Missing auth token at "${stage}" stage. Run login step first.`);
        const market = this.world.orderContext?.market;
        if (!market) throw new Error(`Missing market context at "${stage}" stage. Run market step first.`);
        return { token, market };
    }

    // Submit the accumulated checkout state via the DAO. Mirrors the UI path's
    // placeOrder + success-screen wait: a populated `order_id` is the API's
    // analogue of the success screen rendering.
    private async submitOrderViaApi(country: CountryInfo): Promise<CheckoutResponse> {
        const { token, market } = this.requireAuthAndMarket('verifyOrderAccepted (api)');
        const ctx = this.world.orderContext!;
        const address = this.world.deliveryAddress;
        const contact = this.world.contact;
        const payment = this.world.payment;
        if (!address) throw new Error('Missing delivery address — run the fill-delivery step first.');
        if (!contact)  throw new Error('Missing contact info — run the fill-delivery step first.');
        if (!payment?.method) throw new Error('Missing payment method — run the payment step first.');

        const body: CheckoutRequest = {
            country_code: market,
            items: [{ pizza_id: ctx.pizzaId, size: ctx.size, quantity: ctx.qty }],
            name: contact.name,
            address: address.street,
            phone: contact.phone,
            payment_method: payment.method,
        };

        // Map address into the country-specific zip-shaped field.
        for (const field of country.required_fields ?? []) {
            if (field === 'colonia')         body.colonia    = address.suburb;
            else if (field === 'prefectura') body.prefectura = address.suburb ?? address.zip;
            else if (field === 'plz')        body.plz        = address.zip;
            else if (field === 'zip_code')   body.zip_code   = address.zip;
        }

        const isCard = payment.method.toLowerCase().includes('card');
        if (isCard) {
            body.card_number = payment.cardNumber;
            body.card_expiry = payment.cardExpiry;
            body.card_cvv    = payment.cardCvv;
        }

        // Tip field is required by some markets — default to 0 to stay focused
        // on the order-accepted assertion (tip math has its own tests).
        if (country.tip_field) body[country.tip_field] = 0;

        const result = await this.checkout.placeOrder({ token, countryCode: market, body });
        if (!result.order_id) {
            throw new Error(`API placeOrder rejected the order. Response: ${JSON.stringify(result)}`);
        }
        log.info({
            orderId: result.order_id,
            status: result.status,
            total: result.total,
            currency: result.currency,
        }, 'Order accepted (api driver)');
        return result;
    }

    private pickZipSlot(country: CountryInfo, address: DeliveryAddress): string | undefined {
        for (const field of country.required_fields ?? []) {
            const source = ZIP_SLOT_PRIMARY_BY_FIELD[field];
            if (source) return address[source] || undefined;
        }
        return address.zip || undefined;
    }

    private pickSecondaryAddressField(
        country: CountryInfo,
        value?: string,
    ): SecondaryAddressField | undefined {
        if (!value) return undefined;
        const field = country.required_fields.find((f) => SECONDARY_ADDRESS_FIELDS.has(f));
        if (!field) return undefined;
        return { locatorKey: `${field}Input`, value };
    }
}
