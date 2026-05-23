import { HttpClient } from '@plugins/api/http';
import type { Pizza } from '@core/tests/checkout/dao/checkout.types';
import type {
    CountryCode,
    PizzaBuilderCartItemRequest,
    PizzaBuilderCartResponse,
    PizzaBuilderDaoOptions,
} from '@core/tests/pizzaBuilder/dao/pizzaBuilder.types';

// Reuses the backend endpoints already exposed by the broader checkout
// surface — name resolution comes from `/api/pizzas`, the customized cart
// addition extends `/api/cart` with a `toppings` array per item (see
// pizzaBuilder.api.contract.json for the new contract).
const PATHS = {
    pizzas: '/api/pizzas',
    cart:   '/api/cart',
} as const;

// Internal envelope — backend wraps Pizza[] in {pizzas, country_code, currency}.
// Not exported because callers receive an unwrapped Pizza[] (ISP).
interface PizzaEnvelope {
    pizzas: Pizza[];
    country_code: CountryCode;
    currency: string;
}

// Render free-tier cold starts take 30–45s when idle; match the other DAOs.
const DEFAULT_TIMEOUT_MS = 60_000;

/**
 * Thin client for the builder's two API needs:
 *   1. Name → ID lookup via GET /api/pizzas (so the deep-link `?item=` can
 *      be the resolved pizza id, not the human-facing name).
 *   2. POST /api/cart with the customized {pizza_id, size, toppings, quantity}
 *      payload — the user-confirmed builder state.
 *
 * Kept separate from CheckoutDao because the cart request body differs
 * (toppings on the line item). Sharing the class would either silently
 * drop toppings or force CheckoutDao to grow a field it doesn't need.
 */
export class PizzaBuilderDao {
    private readonly httpClient: HttpClient;

    constructor(options: PizzaBuilderDaoOptions = {}) {
        const apiBaseUrl = options.baseUrl ?? process.env.API_BASE_URL?.replace(/\/+$/, '');
        if (!apiBaseUrl) {
            throw new Error('Missing required env var: API_BASE_URL');
        }
        this.httpClient = new HttpClient({
            baseUrl: apiBaseUrl,
            timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
            fetchImpl: options.fetchImpl,
        });
    }

    async getPizzas(params: {
        token: string;
        countryCode: CountryCode;
        language?: string;
    }): Promise<Pizza[]> {
        const response = await this.httpClient.get<PizzaEnvelope>(PATHS.pizzas, {
            headers: this.authHeaders(params.token, params.countryCode, {
                'X-Language': params.language ?? process.env.LANGUAGE ?? 'en',
            }),
        });
        return response.pizzas;
    }

    /**
     * Resolves an item name (e.g. "Pepperoni") to its market-specific pizza
     * id. Case-insensitive match. Features carry canonical English display
     * names; the backend returns localized names per market (e.g. MX shows
     * "Margarita", JP shows "マルゲリータ") but the underlying `id` is the
     * same across markets (verified against /api/pizzas: `p01` is Margherita
     * in every locale). When the localized fetch misses, we fall back to a
     * canonical (X-Language: en) fetch and resolve there — the id we hand
     * back is still valid for the requested market.
     */
    async resolvePizzaId(params: {
        token: string;
        countryCode: CountryCode;
        itemName: string;
        language?: string;
    }): Promise<string> {
        const pizzas = await this.getPizzas({
            token: params.token,
            countryCode: params.countryCode,
            language: params.language,
        });
        if (!pizzas?.length) {
            throw new Error(`Pizzas API empty for market "${params.countryCode}". Verify /api/pizzas.`);
        }
        let pizza = pizzas.find(
            (p) => p.name.toLowerCase() === params.itemName.toLowerCase(),
        );
        if (!pizza && (params.language ?? 'en').toLowerCase() !== 'en') {
            const canonical = await this.getPizzas({
                token: params.token,
                countryCode: params.countryCode,
                language: 'en',
            });
            pizza = canonical.find(
                (p) => p.name.toLowerCase() === params.itemName.toLowerCase(),
            );
        }
        if (!pizza) {
            const available = pizzas.map((p) => p.name).join(', ');
            throw new Error(
                `Pizza "${params.itemName}" not found for "${params.countryCode}". Available: ${available}`,
            );
        }
        if (!pizza.id) {
            throw new Error(`Pizza "${params.itemName}" has empty id in market "${params.countryCode}".`);
        }
        return pizza.id;
    }

    /**
     * Adds a customized pizza line to the cart. Backend accepts both the
     * checkout shape `{items: [{pizza_id, size, quantity}]}` and the new
     * builder shape `{items: [{pizza_id, size, quantity, toppings}]}`;
     * unknown fields are ignored on the existing route, so older deployments
     * silently fall back to the no-toppings line.
     */
    addCustomizedToCart(params: {
        token: string;
        countryCode: CountryCode;
        items: PizzaBuilderCartItemRequest[];
    }): Promise<PizzaBuilderCartResponse> {
        return this.httpClient.post<PizzaBuilderCartResponse>(PATHS.cart, {
            headers: this.authHeaders(params.token, params.countryCode),
            body: { items: params.items },
        });
    }

    getCart(params: {
        token: string;
        countryCode: CountryCode;
    }): Promise<PizzaBuilderCartResponse> {
        return this.httpClient.get<PizzaBuilderCartResponse>(PATHS.cart, {
            headers: this.authHeaders(params.token, params.countryCode),
        });
    }

    private authHeaders(
        token: string,
        countryCode: CountryCode,
        extra: Record<string, string> = {},
    ): Record<string, string> {
        return {
            Authorization: `Bearer ${token}`,
            'x-country-code': countryCode,
            ...extra,
        };
    }
}
