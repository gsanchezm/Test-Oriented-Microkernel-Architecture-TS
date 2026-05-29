import { sendIntent } from '@kernel/client';
import { INTENT } from '@kernel/intents';
import { logger } from '@utils/logger';

const log = logger.child({ layer: 'molecule', domain: 'profile', action: 'save' });

// Save → wait for the screen to settle. We re-wait on the profile card
// because the save side-effect on web sometimes triggers a re-render that
// detaches+re-attaches the input nodes; the WAIT keeps the next step
// stable.
const SAVE_SETTLE_WAIT_MS = 10_000;

export async function saveProfile(): Promise<void> {
    if (isApiDriver()) {
        log.info({}, 'saveProfile UI click skipped (api driver) — route dispatches DAO PATCH instead');
        return;
    }
    log.info({}, 'Clicking save button');
    await sendIntent(INTENT.CLICK, 'saveButton');
    // Android pops a native "Profile saved" AlertDialog after a successful
    // save. If left open it overlays the form and leaks into the next
    // scenario's deep-link (verified on-device 2026-05-28). Dismiss it
    // best-effort before re-anchoring.
    if (isMobileDriver()) {
        await dismissNativeSaveAlert();
    }
    // Re-anchor the next assertion on a stable element after the save. We
    // anchor on `profileFullNameInput` (not `profileCard`) because the card
    // wrapper is mobile-only in the locator contract; the fullName input
    // carries both `web.{responsive,desktop}` and `mobile` keys and stays
    // mounted across the save side-effect.
    await sendIntent(INTENT.WAIT_FOR_ELEMENT, `profileFullNameInput||${SAVE_SETTLE_WAIT_MS}`);
}

// Taps the native AlertDialog's OK button (android:id/button1). The dialog
// can appear a beat after the save PATCH resolves, so poll briefly; each
// miss throws element-not-found and we retry until it shows or we give up.
async function dismissNativeSaveAlert(): Promise<void> {
    const okButton = 'android=new UiSelector().resourceId("android:id/button1")';
    for (let attempt = 0; attempt < 12; attempt++) {
        try {
            await sendIntent(INTENT.CLICK, okButton);
            log.info({ attempt }, 'Dismissed native "Profile saved" alert');
            return;
        } catch {
            await new Promise((r) => setTimeout(r, 300));
        }
    }
    log.info({}, 'No native save alert to dismiss (continuing)');
}

function isMobileDriver(): boolean {
    const driver = (process.env.DRIVER ?? 'playwright').toLowerCase();
    return driver === 'appium' || driver === 'mobilewright';
}

function isApiDriver(): boolean {
    return (process.env.DRIVER ?? 'playwright').toLowerCase() === 'api';
}
