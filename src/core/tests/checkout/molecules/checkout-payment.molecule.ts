import { sendIntent } from '@kernel/client';
import { INTENT } from '@kernel/intents';

export async function selectPaymentMethod(method: string): Promise<void> {
    const locatorKey = method.toLowerCase() === 'cash' ? 'paymentCashButton' : 'paymentCardButton';
    await sendIntent(INTENT.CLICK, locatorKey);
}

export async function fillCardDetails(card: string, exp: string, cvv: string, holderName?: string): Promise<void> {
    if (holderName) {
        await sendIntent(INTENT.TYPE, `cardHolderNameInput||${holderName}`);
    }
    // Strip non-digit characters — the iOS numpad keyboard on card/expiry/cvv
    // inputs only accepts digits, so "4242 4242 4242 4242" and "12/28" arrive
    // truncated. Send the raw digits and let the app's mask render the format.
    await sendIntent(INTENT.TYPE, `cardNumberInput||${card.replace(/\D/g, '')}`);
    await sendIntent(INTENT.TYPE, `expiryDateInput||${exp.replace(/\D/g, '')}`);
    await sendIntent(INTENT.TYPE, `cvvInput||${cvv.replace(/\D/g, '')}`);
}
