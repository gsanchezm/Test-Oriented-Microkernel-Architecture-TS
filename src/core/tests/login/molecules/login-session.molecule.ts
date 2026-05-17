import { sendIntent } from '@kernel/client';
import { INTENT } from '@kernel/intents';

const POST_LOGIN_WAIT_TARGET = 'logoutButton';
const POST_LOGIN_WAIT_TIMEOUT_MS = 20_000;

const LOGIN_ERROR_WAIT_TIMEOUT_MS = 15_000;

export async function submitCredentials(username: string, password: string): Promise<void> {
    await sendIntent(INTENT.TYPE, `usernameInput||${username}`);
    await sendIntent(INTENT.TYPE, `passwordInput||${password}`);
    await sendIntent(INTENT.CLICK, 'loginButton');
    // Wait for a post-login anchor before downstream assertions run. We use the
    // logout button itself because it's the next step's target — successful wait
    // doubles as a render-readiness signal.
    await sendIntent(
        INTENT.WAIT_FOR_ELEMENT,
        `${POST_LOGIN_WAIT_TARGET}||${POST_LOGIN_WAIT_TIMEOUT_MS}`,
    );
}

// Negative-path twin of submitCredentials. The OmniPizza login form
// pre-fills `standard_user`/`pizza123` (verified via DOM probe). We can't
// rely on TYPE with an empty value (the proxy rejects empty values
// universally), so on web we clear both inputs via EVALUATE first and
// then TYPE only when the test provides a non-empty value. We do NOT
// wait for the logout anchor because the click is supposed to FAIL.
const CLEAR_LOGIN_INPUTS_JS = `(() => {
    const u = document.querySelector("[data-testid^='username-']");
    const p = document.querySelector("[data-testid^='password-']");
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    for (const el of [u, p]) {
        if (!el) continue;
        setter.call(el, '');
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
    }
    return 'cleared';
})()`;

function isWebDriver(): boolean {
    const driver = (process.env.DRIVER ?? 'playwright').toLowerCase();
    return driver === 'playwright';
}

export async function submitInvalidCredentials(username: string, password: string): Promise<void> {
    if (isWebDriver()) {
        // Reset the React-controlled inputs to '' so empty test cases truly
        // submit blank fields (not the demo's default-filled credentials).
        await sendIntent(INTENT.EVALUATE, CLEAR_LOGIN_INPUTS_JS);
        // Plant a sentinel BEFORE the click. The OmniPizza FE handles 401 by
        // reloading the page (verified via DOM probe — window globals are wiped
        // and the login-error banner never renders), so the route can detect
        // that reload-as-rejection path by polling for the sentinel after the
        // click. Other failure codes (403/422) render the banner directly.
        await sendIntent(
            INTENT.EVALUATE,
            `window.__loginAttemptSentinel = 'sentinel-${Date.now()}';`,
        );
    } else {
        // On mobile, the OmniPizza app pre-fills `standard_user` / `pizza123`
        // and `noReset: true` keeps that state across scenarios. We MUST clear
        // both inputs unconditionally — otherwise empty test cases submit the
        // demo defaults, the API accepts them, and we never see the error.
        await sendIntent(INTENT.CLEAR_TEXT, 'usernameInput');
        await sendIntent(INTENT.CLEAR_TEXT, 'passwordInput');
    }
    if (username.length > 0) {
        await sendIntent(INTENT.TYPE, `usernameInput||${username}`);
    }
    if (password.length > 0) {
        await sendIntent(INTENT.TYPE, `passwordInput||${password}`);
    }
    await sendIntent(INTENT.CLICK, 'loginButton');
}

export async function loginAttemptSentinelPresent(): Promise<boolean> {
    const result = await sendIntent(
        INTENT.EVALUATE,
        `typeof window.__loginAttemptSentinel === 'string'`,
    );
    return (result.payload ?? '').trim() === 'true';
}

export async function waitForLoginError(): Promise<void> {
    await sendIntent(
        INTENT.WAIT_FOR_ELEMENT,
        `loginError||${LOGIN_ERROR_WAIT_TIMEOUT_MS}`,
    );
}

export async function readLoginErrorText(): Promise<string> {
    const result = await sendIntent(INTENT.READ_TEXT, 'loginError');
    return (result.payload ?? '').trim();
}

export async function assertLogoutLabel(expected: string): Promise<void> {
    await sendIntent(INTENT.ASSERT_TEXT, `logoutButton||${expected}`);
}
