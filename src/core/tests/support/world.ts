import type { LoginResponse } from '@core/tests/login/dao/login.types';
import type { CartItemResponse, CountryInfo, CountryCode } from '@core/tests/checkout/dao/checkout.types';

export interface CheckoutWorld {
    auth?: {
        userAlias: string;
        username: string;
        password: string;
        behavior?: string;
        token?: string;
        loginResponse: LoginResponse;
    };
    orderContext?: {
        market: CountryCode;
        countryInfo: CountryInfo;
        availableLanguages: string[];
        requiredFields: string[];
        currency: string;
        currencySymbol: string;
        item: string;
        size: string;
        qty: number;
        pizzaId: string;
        pizzaName: string;
        unitPrice: number;
        cartItems: CartItemResponse[];
    };
    contact?: {
        name: string;
        phone: string;
    };
}

