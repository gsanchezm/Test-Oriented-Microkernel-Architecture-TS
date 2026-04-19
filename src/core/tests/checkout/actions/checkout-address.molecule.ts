import { sendIntent } from '../../../../kernel/client';

export interface SecondaryAddressField {
    locatorKey: string;
    value: string;
}

export async function fillDeliveryAddress(
    street: string,
    zip: string,
    secondary?: SecondaryAddressField,
): Promise<void> {
    await sendIntent('TYPE', `streetInput||${street}`);
    await sendIntent('TYPE', `zipCodeInput||${zip}`);
    if (secondary) {
        await sendIntent('TYPE', `${secondary.locatorKey}||${secondary.value}`);
    }
}

export async function fillContactInfo(name: string, phone: string): Promise<void> {
    await sendIntent('TYPE', `fullNameInput||${name}`);
    await sendIntent('TYPE', `phoneNumberInput||${phone}`);
}
