// Public HTTP contract for the OrderSuccess DAO.
// Mirrors the shape OmniPizza's GET /api/orders/{order_id} returns and the
// LastOrder interface the client stores expose (useAppStore.ts on mobile,
// useOrderStore on web). Kept separate from order_success.dao.ts so consumers
// (molecules, route, fixtures) can import the shapes without pulling the DAO
// class (SRP) and so a test that only needs the response shape (e.g. a
// pretty-printed expectation) doesn't depend on http transports (ISP).

import type { CountryCode } from '@plugins/api/http';

// Re-export so consumers don't reach into the API plugin for the country type.
export type { CountryCode };

// -- single order ---------------------------------------------------------

export interface OrderResponse {
    order_id: string;
    status?: string;
    subtotal: number;
    delivery_fee: number;
    tax: number;
    tip?: number;
    total: number;
    currency: string;
    currency_symbol: string;
    // The list endpoint and the per-order endpoint both echo back the
    // requesting user + market; not load-bearing for assertions but useful
    // when validating multi-user fixtures.
    username?: string;
    country_code?: CountryCode;
    // Backend may include the original items / delivery snapshot. Treated as
    // opaque here — the route asserts against keys it knows.
    [key: string]: unknown;
}

// -- order listing --------------------------------------------------------

export interface OrderListResponse {
    orders: OrderResponse[];
}

// -- DAO construction -----------------------------------------------------

export interface OrderSuccessDaoOptions {
    baseUrl?: string;
    timeoutMs?: number;
    fetchImpl?: typeof fetch;
}
