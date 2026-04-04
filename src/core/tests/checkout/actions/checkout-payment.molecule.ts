import { sendIntent } from '../../../../kernel/client';

export async function selectPaymentMethod(method: string): Promise<void> {
    const locatorKey = method.toLowerCase() === 'cash' ? 'paymentCashButton' : 'paymentCardButton';
    await sendIntent('CLICK', locatorKey);
}

export async function fillCardDetails(card: string, exp: string, cvv: string): Promise<void> {
    await sendIntent('TYPE', `cardHolderNameInput||${card}`);
    await sendIntent('TYPE', `cardNumberInput||${card}`);
    await sendIntent('TYPE', `expiryDateInput||${exp}`);
    await sendIntent('TYPE', `cvvInput||${cvv}`);
}
