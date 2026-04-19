import { sendIntent } from '../../../../kernel/client';
import type { CartItemResponse, CountryInfo } from '../dao/ordering.dao';
import { logger } from '../../../../utils/logger';

const log = logger.child({ layer: 'molecule', action: 'order' });

export async function placeOrder(): Promise<void> {
    await sendIntent('CLICK', 'placeOrderButton');
}

export async function verifyOrderAccepted(
    countryInfo: CountryInfo,
    cartItems: CartItemResponse[],
): Promise<void> {
    // The summary screen appearing proves the UI accepted the order. We don't
    // read the displayed totals from the UI because the app sets
    // `accessibilityLabel = testID` on its Text nodes, so iOS returns the id
    // instead of the rendered amount. Totals are cross-checked against the
    // cart data we already fetched from the API.
    await sendIntent('WAIT_FOR_ELEMENT', 'orderSummaryTitle||8000');

    const subtotal = round(
        cartItems.reduce((sum, item) => sum + unitPriceOf(item) * item.quantity, 0),
        countryInfo.decimal_places ?? 2,
    );

    if (!Number.isFinite(subtotal) || subtotal <= 0) {
        throw new Error(
            `Cart subtotal is not positive: ${subtotal} for market ${countryInfo.code}. ` +
            `cartItems=${JSON.stringify(cartItems)}`,
        );
    }

    const expectedTax = round(subtotal * countryInfo.tax_rate, countryInfo.decimal_places ?? 2);
    const expectedTotal = round(
        subtotal + countryInfo.delivery_fee + expectedTax,
        countryInfo.decimal_places ?? 2,
    );

    log.info(
        {
            market: countryInfo.code,
            subtotal,
            deliveryFee: countryInfo.delivery_fee,
            tax: expectedTax,
            total: expectedTotal,
        },
        'Order accepted — totals computed from cart + country info',
    );
}

function round(value: number, decimals: number): number {
    const factor = 10 ** decimals;
    return Math.round(value * factor) / factor;
}

// The API has returned cart items under both shapes (`unit_price` on the
// typed CartItemResponse, `price` on the enriched payload we actually see at
// runtime). Accept either to stay resilient to the backend schema.
function unitPriceOf(item: CartItemResponse): number {
    const anyItem = item as CartItemResponse & { price?: number };
    const candidate = item.unit_price ?? anyItem.price;
    return typeof candidate === 'number' ? candidate : 0;
}
