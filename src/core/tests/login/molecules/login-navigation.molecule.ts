import { sendIntent } from '@kernel/client';
import { INTENT } from '@kernel/intents';
import { logger } from '@utils/logger';

const log = logger.child({ layer: 'molecule', action: 'login-navigation' });

// Wait on `welcomeTitleText` — the element the first assertion targets, so a
// successful wait doubles as a render-readiness signal. We avoid the
// `~screen-login` wrapper because empty XCUIElementTypeOther wrappers in RN
// never report visible on iOS and waitForDisplayed hangs.
const LOGIN_WAIT_TARGET = 'welcomeTitleText';
const LOGIN_WAIT_TIMEOUT_MS = 20_000;

export async function openLoginScreen(): Promise<void> {
    const driver = process.env.DRIVER ?? 'playwright';

    // No UI to open under api driver — the login screen is a UI concept; the
    // route's loginAs() will hit the auth endpoint directly via LoginDao.
    if (driver === 'api') {
        log.info({ driver }, 'Login screen no-op (api driver)');
        return;
    }

    if (driver === 'appium' || driver === 'mobilewright') {
        // The app launches into the login screen; nothing to navigate to.
        await sendIntent(
            INTENT.WAIT_FOR_ELEMENT,
            `${LOGIN_WAIT_TARGET}||${LOGIN_WAIT_TIMEOUT_MS}`,
        );
        log.info({ driver }, 'Login screen ready (mobile)');
        return;
    }

    const baseUrl = process.env.BASE_URL;
    if (!baseUrl) {
        throw new Error('Missing required env var: BASE_URL');
    }
    await sendIntent(INTENT.NAVIGATE, baseUrl);
    await sendIntent(
        INTENT.WAIT_FOR_ELEMENT,
        `${LOGIN_WAIT_TARGET}||${LOGIN_WAIT_TIMEOUT_MS}`,
    );
    log.info({ driver, baseUrl }, 'Login screen ready (web)');
}
