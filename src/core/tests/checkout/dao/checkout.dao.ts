import { HttpClient } from '@plugins/api/http';
import type {
    CartItemRequest,
    CartResponse,
    CheckoutDaoOptions,
    CheckoutRequest,
    CheckoutResponse,
    CountryCode,
    CountryInfo,
    Pizza,
} from '@core/tests/checkout/dao/checkout.types';

// Internal shape — backend wraps Pizza[] in an envelope. Not exported because
// callers receive an unwrapped Pizza[] (ISP: don't expose what consumers don't use).
interface PizzaEnvelope {
    pizzas: Pizza[];
    country_code: CountryCode;
    currency: string;
}

// Overrides HttpClient's default. Must stay ≥45s — Render free tier cold starts
// take 30–45s when the instance has been idle.
const DEFAULT_TIMEOUT_MS = 60_000;

const PATHS = {
    countries: '/api/countries',
    pizzas: '/api/pizzas',
    cart: '/api/cart',
    checkout: '/api/checkout',
} as const;

export class CheckoutDao {
    private readonly httpClient: HttpClient;

    constructor(options: CheckoutDaoOptions = {}) {
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

    getCountries(): Promise<CountryInfo[]> {
        return this.httpClient.get<CountryInfo[]>(PATHS.countries);
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

    addToCart(params: {
        token: string;
        countryCode: CountryCode;
        items: CartItemRequest[];
    }): Promise<CartResponse> {
        return this.httpClient.post<CartResponse>(PATHS.cart, {
            headers: this.authHeaders(params.token, params.countryCode),
            body: { items: params.items },
        });
    }

    getCart(params: {
        token: string;
        countryCode: CountryCode;
    }): Promise<CartResponse> {
        return this.httpClient.get<CartResponse>(PATHS.cart, {
            headers: this.authHeaders(params.token, params.countryCode),
        });
    }

    placeOrder(params: {
        token: string;
        countryCode: CountryCode;
        body: CheckoutRequest;
    }): Promise<CheckoutResponse> {
        return this.httpClient.post<CheckoutResponse>(PATHS.checkout, {
            headers: this.authHeaders(params.token, params.countryCode),
            body: params.body,
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
