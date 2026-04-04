import { sendIntent } from '../../../../kernel/client';

export async function fillDeliveryAddress(street: string, zip: string, suburb?: string): Promise<void> {
    await sendIntent('TYPE', `streetInput||${street}`);
    await sendIntent('TYPE', `zipCodeInput||${zip}`);
    if (suburb) {
        await sendIntent('TYPE', `suburbInput||${suburb}`);
    }
}

export async function fillContactInfo(name: string, phone: string): Promise<void> {
    await sendIntent('TYPE', `fullNameInput||${name}`);
    await sendIntent('TYPE', `phoneNumberInput||${phone}`);
}
