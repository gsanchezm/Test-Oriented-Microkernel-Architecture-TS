import { sendIntent } from '@kernel/client';
import { INTENT } from '@kernel/intents';

export interface SecondaryAddressField {
    locatorKey: string;
    value: string;
}

export async function fillDeliveryAddress(
    street: string,
    zip: string | undefined,
    secondary?: SecondaryAddressField,
): Promise<void> {
    await sendIntent(INTENT.TYPE, `streetInput||${street}`);
    if (zip) {
        await sendIntent(INTENT.TYPE, `zipCodeInput||${zip}`);
    }
    if (secondary) {
        await sendIntent(INTENT.TYPE, `${secondary.locatorKey}||${secondary.value}`);
    }
}

export async function fillContactInfo(name: string, phone: string): Promise<void> {
    await sendIntent(INTENT.TYPE, `fullNameInput||${name}`);
    await sendIntent(INTENT.TYPE, `phoneNumberInput||${phone}`);
}
