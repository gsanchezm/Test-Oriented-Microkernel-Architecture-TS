import type { LoginResponse } from '@core/tests/login/dao/login.types';
import type { CartItemResponse, CheckoutResponse, CountryInfo, CountryCode } from '@core/tests/checkout/dao/checkout.types';

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
    // Market + language chosen on the login screen. Populated by LoginRoute so
    // downstream assertions (especially under DRIVER=api, which has no UI to
    // read from) can recover the chosen locale.
    locale?: {
        market: string;
        language: string;
    };
    // Delivery + payment captured by the route. Under DRIVER=api the UI steps
    // never run, so the route accumulates the inputs here and the final
    // verifyOrderAccepted step submits the order via CheckoutDao.placeOrder.
    deliveryAddress?: {
        street: string;
        zip?: string;
        suburb?: string;
    };
    payment?: {
        method: string;
        cardNumber?: string;
        cardExpiry?: string;
        cardCvv?: string;
    };
    checkoutResult?: CheckoutResponse;
    // Set by LoginRoute.attemptLogin when the credentials are expected to fail.
    // Under DRIVER=api the route catches HttpError, records status+message here,
    // and the Then-step asserts against it instead of a UI element.
    loginAttempt?: {
        ok: boolean;
        status?: number;
        message?: string;
    };
}

