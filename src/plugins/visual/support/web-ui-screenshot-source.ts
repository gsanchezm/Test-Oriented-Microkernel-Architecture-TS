// Playwright screenshot adapter. Reuses the Playwright plugin's
// per-session active page; never creates a new browser context. If no
// session exists the underlying getActivePage() throws with a precise
// message, which is the right behavior for an oracle: visual checks
// must run *after* a UI step has already opened a page.

import { getActivePage } from '@plugins/web-ui/web-ui';
import { ScreenshotCaptureOptions, ScreenshotSource } from '@plugins/visual/support/screenshot-source';

export class PlaywrightScreenshotSource implements ScreenshotSource {
    async capture(options: ScreenshotCaptureOptions): Promise<Buffer> {
        const page = getActivePage(options.sessionId ?? '0');

        if (options.regionSelector) {
            try {
                const locator = page.locator(options.regionSelector).first();
                return await locator.screenshot({ type: 'png' });
            } catch (err) {
                // Fall through to full-page capture so the comparison
                // step can still run and produce a useful diff/error.
                process.stderr.write(
                    `[visual:playwright] region '${options.regionSelector}' not capturable, ` +
                    `falling back to full page: ${(err as Error).message}\n`,
                );
            }
        }

        return await page.screenshot({ type: 'png', fullPage: true });
    }
}
