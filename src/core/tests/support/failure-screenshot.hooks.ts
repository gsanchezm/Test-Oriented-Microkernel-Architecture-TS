// Global After hook that captures a screenshot whenever a UI scenario fails
// and attaches it to the cucumber report as image/png.
//
// Design notes:
//   - Best-effort only: the entire body is wrapped in try/catch so a capture
//     failure (e.g. browser already closed, gRPC unavailable) NEVER propagates
//     to the scenario result — mirrors the non-blocking philosophy of the
//     @visual After hooks.
//   - Non-UI drivers are skipped: if DRIVER=api there is no page/driver to
//     capture from. mobilewright, appium, and playwright all proceed.
//   - cucumber-js auto-loads everything under `src/core/tests/support/**` via
//     the paths configured in cucumber.js, so this file is picked up without
//     any additional registration.

import { After, Status, World } from '@cucumber/cucumber';
import { sendIntent } from '@kernel/client';
import { INTENT } from '@kernel/intents';
import { logger } from '@utils/logger';

const screenshotLog = logger.child({ layer: 'hook', concern: 'failure-screenshot' });

After(async function (this: World, { result }) {
    // Only fire on failure.
    if (result?.status !== Status.FAILED) return;

    // No page/driver for the pure-API path — skip silently.
    const driver = (process.env.DRIVER ?? 'playwright').toLowerCase();
    if (driver === 'api') return;

    try {
        const res = await sendIntent(INTENT.SCREENSHOT, '');
        await this.attach(Buffer.from(res.payload ?? '', 'base64'), 'image/png');
    } catch (err) {
        // Swallow — screenshot failure must never corrupt the functional result.
        screenshotLog.warn(
            { err: (err as Error).message },
            'Failure screenshot capture did not complete — continuing',
        );
    }
});
