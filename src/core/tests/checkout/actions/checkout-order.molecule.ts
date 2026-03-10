import { sendIntent } from '../../../../kernel/client';

export async function placeOrder(): Promise<void> {
    await sendIntent('CLICK', 'placeOrderButton');
}

export async function verifyOrderSummary(
    subtotal: string,
    tax: string,
    total: string,
): Promise<void> {
    const response = await sendIntent('READ_TEXT', 'orderDetailsList');
    const text = response.payload;

    if (!text.includes(subtotal) || !text.includes(tax) || !text.includes(total)) {
        throw new Error(
            `Order verification failed. Expected subtotal=${subtotal}, tax=${tax}, total=${total}. Got: ${text}`,
        );
    }
}
