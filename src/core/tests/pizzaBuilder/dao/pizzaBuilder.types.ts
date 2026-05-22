// Public HTTP contract for the PizzaBuilder DAO.
// Kept separate from pizzaBuilder.dao.ts so consumers (molecules, routes,
// fixtures) can import the data shapes without depending on the class (SRP)
// and so a fixture that only needs the response shape doesn't pull the http
// transport with it (ISP).
//
// The builder shares `/api/pizzas` (for name → id resolution) and extends
// `/api/cart` with a toppings-aware request body. The checkout DAO posts
// `{items: [{pizza_id, size, quantity}]}`; the builder posts the SAME shape
// PLUS a `toppings` array per item. The backend already accepts the
// toppings field on the cart row (CartItemResponse.config.toppings exists
// in checkout types) — the new contract is that the FE/customizer can SEND
// toppings on the POST instead of just persisting them server-side after
// checkout. See pizzaBuilder.api.contract.json for the expected wire shape.

import type { CountryCode } from '@plugins/api/http';

// Re-export so consumers of pizzaBuilder types don't reach into the API plugin.
export type { CountryCode };

// -- cart additions -------------------------------------------------------

export interface PizzaBuilderCartItemRequest {
    pizza_id: string;
    size: string;
    quantity: number;
    // Topping IDs as the user picked them in the builder. Order is preserved
    // server-side so the cart line matches what the user assembled.
    toppings: string[];
}

export interface PizzaBuilderCartLine {
    id: string;
    pizza_id: string;
    quantity: number;
    config: {
        size: string;
        toppings: string[];
    };
    unit_price: number;
    currency: string;
    currency_symbol: string;
}

export interface PizzaBuilderCartResponse {
    username: string;
    country_code: CountryCode;
    cart_items: PizzaBuilderCartLine[];
    updated_at: string;
}

// -- DAO construction -----------------------------------------------------

export interface PizzaBuilderDaoOptions {
    baseUrl?: string;
    timeoutMs?: number;
    fetchImpl?: typeof fetch;
}
