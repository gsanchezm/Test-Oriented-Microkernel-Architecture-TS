import { injectBrowserSession, BrowserSessionState } from '../actions/checkout-auth.molecule';
import { navigateToCheckout } from '../actions/checkout-navigation.molecule';
import { fillDeliveryAddress, fillContactInfo, SecondaryAddressField } from '../actions/checkout-address.molecule';
import { selectPaymentMethod, fillCardDetails } from '../actions/checkout-payment.molecule';
import { placeOrder, verifyOrderAccepted as verifyOrderOnUI } from '../actions/checkout-order.molecule';
import type { CartItemResponse, CountryInfo } from '../dao/ordering.dao';

const SECONDARY_ADDRESS_FIELDS = ['colonia', 'prefectura'] as const;

function pickSecondaryAddressField(
    countryInfo: CountryInfo,
    value?: string,
): SecondaryAddressField | undefined {
    if (!value) return undefined;
    const field = countryInfo.required_fields.find((f) =>
        (SECONDARY_ADDRESS_FIELDS as readonly string[]).includes(f),
    );
    return field ? { locatorKey: `${field}Input`, value } : undefined;
}

export interface DeliveryDetails {
    street: string;
    zip: string;
    suburb?: string;
}

export interface ContactDetails {
    name: string;
    phone: string;
}

export async function fillDeliveryDetails(
    session: BrowserSessionState,
    delivery: DeliveryDetails,
    contact: ContactDetails,
): Promise<void> {
    await injectBrowserSession(session);
    await navigateToCheckout(session.countryCode, session.token);
    const secondary = pickSecondaryAddressField(session.countryInfo, delivery.suburb);
    await fillDeliveryAddress(delivery.street, delivery.zip, secondary);
    await fillContactInfo(contact.name, contact.phone);
}

export async function choosePaymentMethod(method: string): Promise<void> {
    await selectPaymentMethod(method);
}

export async function enterCardDetails(
    card: string,
    exp: string,
    cvv: string,
    holderName?: string,
): Promise<void> {
    await fillCardDetails(card, exp, cvv, holderName);
}

export async function verifyOrderAccepted(
    countryInfo: CountryInfo,
    cartItems: CartItemResponse[],
): Promise<void> {
    await placeOrder();
    await verifyOrderOnUI(countryInfo, cartItems);
}
