import { HttpClient } from '@plugins/api/http';
import type {
    CountryCode,
    OrderListResponse,
    OrderResponse,
    OrderSuccessDaoOptions,
} from '@core/tests/order_success/dao/order_success.types';

const PATHS = {
    orders:    '/api/orders',
    orderById: (id: string) => `/api/orders/${encodeURIComponent(id)}`,
} as const;

// Overrides HttpClient's default. Must stay ≥45s — Render free tier cold
// starts take 30–45s when the instance has been idle.
const DEFAULT_TIMEOUT_MS = 60_000;

/**
 * Thin client over the Orders API.
 *
 * `getOrder(orderId)` mirrors what the OmniPizza app does inside
 * `useDeepLinkParams.ts:117-128` (mobile) and `OrderSuccess.jsx:21-26` (web)
 * — it's the same backend call, just exposed for the test framework so
 * scenarios can validate the persisted order via API instead of (or in
 * addition to) reading the rendered UI text.
 */
export class OrderSuccessDao {
    private readonly httpClient: HttpClient;

    constructor(options: OrderSuccessDaoOptions = {}) {
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

    getOrder(params: { token: string; orderId: string; countryCode?: CountryCode }): Promise<OrderResponse> {
        return this.httpClient.get<OrderResponse>(PATHS.orderById(params.orderId), {
            headers: this.authHeaders(params.token, params.countryCode),
        });
    }

    listOrders(params: { token: string; countryCode?: CountryCode }): Promise<OrderListResponse> {
        return this.httpClient.get<OrderListResponse>(PATHS.orders, {
            headers: this.authHeaders(params.token, params.countryCode),
        });
    }

    private authHeaders(
        token: string,
        countryCode?: CountryCode,
        extra: Record<string, string> = {},
    ): Record<string, string> {
        const headers: Record<string, string> = {
            Authorization: `Bearer ${token}`,
            ...extra,
        };
        if (countryCode) {
            headers['x-country-code'] = countryCode;
        }
        return headers;
    }
}
