// Public HTTP contract for the Catalog DAO.
// Kept separate from catalog.dao.ts so consumers (molecules, routes, fixtures)
// can import the data shapes without depending on the class (SRP), and so a
// test that only needs the response shape doesn't pay for the http transport
// (ISP).

import type { CountryCode } from '@plugins/api/http';
// Re-use the Pizza shape from the checkout DAO. The OmniPizza backend serves
// /api/pizzas as the single source of truth for both the catalog grid (read)
// and the cart selection step (write); keeping the type shared keeps the two
// slices aligned when the backend's pizza schema evolves.
import type { Pizza } from '@core/tests/checkout/dao/checkout.types';

// Re-export so consumers don't reach into the checkout/api plugins.
export type { CountryCode, Pizza };

// The backend wraps the pizza array in an envelope (verified via the
// CheckoutDao path) — keep the shape here too so the catalog DAO can return
// the unwrapped Pizza[] (ISP: don't expose what consumers don't use).
export interface CatalogResponse {
    pizzas: Pizza[];
    country_code: CountryCode;
    currency: string;
}

export interface CatalogDaoOptions {
    baseUrl?: string;
    timeoutMs?: number;
    fetchImpl?: typeof fetch;
}

// Canonical category taxonomy shipped by the OmniPizza backend on
// /api/pizzas — `pizza.category` per item — and matching the FE's
// `category-<id>` testid set (CategoryFilter.jsx). `all` is the no-filter
// pseudo-bucket exposed by the UI; the API uses `popular | veggie | meat |
// sides` for actual pizza assignment.
export type CatalogCategory = 'all' | 'popular' | 'veggie' | 'meat' | 'sides';
