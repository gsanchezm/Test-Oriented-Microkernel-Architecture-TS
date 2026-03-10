import { sendIntent } from '../../../../kernel/client';

export async function selectPaymentMethod(): Promise<void> {
    await sendIntent('CLICK', 'paymentMethodList');
}

export async function fillCardDetails(card: string, exp: string, cvv: string): Promise<void> {
    await sendIntent('TYPE', `cardHolderNameInput||${card}`);
    await sendIntent('TYPE', `cardNumberInput||${card}`);
    await sendIntent('TYPE', `expiryDateInput||${exp}`);
    await sendIntent('TYPE', `cvvInput||${cvv}`);
}
