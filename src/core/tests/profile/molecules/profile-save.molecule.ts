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
    // Re-anchor the next assertion on a stable element after the save. We
    // anchor on `profileFullNameInput` (not `profileCard`) because the card
    // wrapper is mobile-only in the locator contract; the fullName input
    // carries both `web.{responsive,desktop}` and `mobile` keys and stays
    // mounted across the save side-effect.
    await sendIntent(INTENT.WAIT_FOR_ELEMENT, `profileFullNameInput||${SAVE_SETTLE_WAIT_MS}`);
}

function isApiDriver(): boolean {
    return (process.env.DRIVER ?? 'playwright').toLowerCase() === 'api';
}
