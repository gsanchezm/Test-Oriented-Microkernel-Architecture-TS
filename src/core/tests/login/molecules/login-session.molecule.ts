import { sendIntent } from '@kernel/client';
import { INTENT } from '@kernel/intents';

const POST_LOGIN_WAIT_TARGET = 'logoutButton';
const POST_LOGIN_WAIT_TIMEOUT_MS = 20_000;

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

export async function assertLogoutLabel(expected: string): Promise<void> {
    await sendIntent(INTENT.ASSERT_TEXT, `logoutButton||${expected}`);
}
