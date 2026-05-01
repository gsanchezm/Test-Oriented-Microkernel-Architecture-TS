// Public HTTP contracts for the Checkout DAO.
// Kept separate from checkout.dao.ts so consumers (molecules, routes, the world)
// can import the data shapes without depending on the class (SRP), and so a
// test fixture or contract validator only pays for the types it needs (ISP).

import type { CountryCode } from '@plugins/api/http';

// Re-export so consumers of checkout types don't reach into the API plugin.
export type { CountryCode };

// -- countries / catalog --

export interface CountryInfo {
    code: CountryCode;
    currency: string;
    currency_symbol: string;
    required_fields: string[];
    optional_fields: string[];
    tax_rate: number;
    delivery_fee: number;
    tip_field: string;
    tip_mode: 'percentage';
    languages: string[];
    decimal_places?: number;
}

export interface Pizza {
    id: string;
    name: string;
    description: string;
    price: number;
    base_price: number;
    currency: string;
    currency_symbol: string;
    image: string;
}

// -- cart --

export interface CartItemRequest {
    pizza_id: string;
    size: string;
    quantity: number;
}

export interface CartItemResponse {
    id: string;
    signature: string;
    pizza_id: string;
    pizza: Pizza;
    quantity: number;
    config: { size: string; toppings: string[] };
    unit_price: number;
    currency: string;
    currency_symbol: string;
}

export interface CartResponse {
    username: string;
    country_code: CountryCode;
    cart_items: CartItemResponse[];
    updated_at: string;
}

// -- checkout submit --

export interface CheckoutRequest {
    country_code: CountryCode;
    items: CartItemRequest[];
    name: string;
    address: string;
    phone: string;
    payment_method: string;
    zip_code?: string;
    plz?: string;
    colonia?: string;
    prefectura?: string;
    card_number?: string;
    card_expiry?: string;
    card_cvv?: string;
    [tipField: string]: unknown;
}

export interface CheckoutResponse {
    order_id: string;
    status: string;
    subtotal: number;
    delivery_fee: number;
    tax: number;
    tip?: number;
    total: number;
    currency: string;
    currency_symbol: string;
}

// -- DAO construction --

export interface CheckoutDaoOptions {
    baseUrl?: string;
    timeoutMs?: number;
    fetchImpl?: typeof fetch;
}
