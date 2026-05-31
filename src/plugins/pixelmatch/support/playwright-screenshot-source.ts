// Playwright screenshot adapter. Reuses the Playwright plugin's
// per-session active page; never creates a new browser context. If no
// session exists the underlying getActivePage() throws with a precise
// message, which is the right behavior for an oracle: visual checks
// must run *after* a UI step has already opened a page.

import { getActivePage } from '@plugins/playwright/playwright';
import { ScreenshotCaptureOptions, ScreenshotSource } from '@plugins/pixelmatch/support/screenshot-source';

export class PlaywrightScreenshotSource implements ScreenshotSource {
    async capture(options: ScreenshotCaptureOptions): Promise<Buffer> {
        const page = getActivePage(options.sessionId ?? '0');

        // Settle the frame so a baseline and a later compare capture the SAME
        // pixels: wait for the network to go idle (catches async writes like the
        // profile save's in-flight PATCH + re-hydration, and lazy images) and
        // for web fonts to swap in (FOUT/FOIT). Both bounded and swallowed — a
        // flaky settle must never fail the capture itself. Native
        // `animations:'disabled'` + `caret:'hide'` on the screenshot freeze CSS
        // animations/transitions and hide the text caret. Together these remove
        // the timing-driven drift that flaked post_save / login / navbar i18n.
        await this.stabilize(page);

        if (options.regionSelector) {
            try {
                const locator = page.locator(options.regionSelector).first();
                return await locator.screenshot({ type: 'png', animations: 'disabled', caret: 'hide' });
            } catch (err) {
                // Fall through to full-page capture so the comparison
                // step can still run and produce a useful diff/error.
                process.stderr.write(
                    `[visual:playwright] region '${options.regionSelector}' not capturable, ` +
                    `falling back to full page: ${(err as Error).message}\n`,
                );
            }
        }

        return await page.screenshot({ type: 'png', fullPage: true, animations: 'disabled', caret: 'hide' });
    }

    private async stabilize(page: ReturnType<typeof getActivePage>): Promise<void> {
        await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
        // async/void so Playwright doesn't try to serialize the FontFaceSet.
        await page.evaluate(async () => { await document.fonts?.ready; }).catch(() => {});
    }
}
