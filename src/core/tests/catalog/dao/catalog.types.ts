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

// Logical category buckets exposed to the catalog feature. The backend does
// not yet ship a structured `category` field on Pizza — the catalog UI buckets
// items by name conventions (classic/vegetarian/premium). The DAO surfaces a
// pure-string union here so feature-file values (`classic`, `vegetarian`,
// `premium`) stay type-checked and the molecule's filter logic has one place
// to evolve when the backend exposes a real category column.
export type CatalogCategory = 'classic' | 'vegetarian' | 'premium';
