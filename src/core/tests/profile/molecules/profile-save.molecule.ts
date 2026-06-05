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
    //
    // IMPORTANT: the dismiss uses an Android UiSelector (`android:id/button1`).
    // On iOS that is an INVALID locator strategy whose error is not cleanly
    // catchable client-side — it crashes the Appium plugin session (observed
    // 2026-06-03/04: profile scenarios took down the plugin with ECONNREFUSED).
    // So gate strictly on the Android PLATFORM, not just "is mobile" (the
    // `appium` driver serves both Android and iOS).
    if (isMobileDriver() && isAndroidPlatform()) {
        await dismissNativeSaveAlert();
    }
    // iOS pops the same native "Profile saved" alert (Alert.alert). It was
    // previously left open on iOS — the Android selector is invalid on iOS and
    // crashed the plugin — so it leaked over the form and into the next
    // scenario's deep-link (this is the cause of the profile-open timeouts on
    // iOS). Dismiss it with an iOS-valid, side-effect-free probe-then-click.
    await dismissIOSSaveAlertIfPresent();
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

// iOS-only, best-effort dismissal of the native "Profile saved" alert. RN's
// single-arg Alert.alert renders a default "OK" button. We PROBE with READ_TEXT
// first (find-many → returns '' when the button is absent, with NO scroll/tap
// side effects) and only CLICK when it's actually present — so on a screen
// without an alert this is a cheap no-op that can't scroll or disturb the form.
// The Android `android:id/button1` UiSelector is an INVALID strategy on iOS
// (it crashed the plugin), which is why iOS needs its own predicate selector.
// Never throws. Exported so profile-open can also clear an orphan alert leaked
// from a prior scenario on a reused simulator session.
export async function dismissIOSSaveAlertIfPresent(attempts = 12): Promise<void> {
    if (!isMobileDriver() || !isIOSPlatform()) return;
    const okButton = '-ios predicate string:type == "XCUIElementTypeButton" AND label == "OK"';
    for (let attempt = 0; attempt < attempts; attempt++) {
        const probe = await sendIntent(INTENT.READ_TEXT, okButton).catch(() => null);
        if ((probe?.payload ?? '').trim() !== '') {
            await sendIntent(INTENT.CLICK, okButton).catch(() => { /* alert raced away */ });
            log.info({ attempt }, 'Dismissed native "Profile saved" alert (iOS)');
            return;
        }
        await new Promise((r) => setTimeout(r, 300));
    }
    log.info({}, 'No iOS save alert to dismiss (continuing)');
}

function isMobileDriver(): boolean {
    const driver = (process.env.DRIVER ?? 'playwright').toLowerCase();
    return driver === 'appium' || driver === 'mobilewright';
}

// The native "Profile saved" AlertDialog dismissal is Android-only (it targets
// `android:id/button1`). PLATFORM selects the OS the mobile driver runs against.
function isAndroidPlatform(): boolean {
    return (process.env.PLATFORM ?? '').toLowerCase() === 'android';
}

function isIOSPlatform(): boolean {
    return (process.env.PLATFORM ?? '').toLowerCase() === 'ios';
}

function isApiDriver(): boolean {
    return (process.env.DRIVER ?? 'playwright').toLowerCase() === 'api';
}
