// Appium screenshot adapter. Reuses the Appium plugin's per-session
// active driver; never creates a new mobile session.
//
// WebdriverIO's `takeScreenshot()` returns a base64-encoded PNG of the
// full screen — region cropping is left to a future enhancement so that
// this initial implementation stays small and predictable. Region
// selectors are still passed through and recorded in the result JSON.

import { getActiveDriver } from '@plugins/appium/appium';
import { ScreenshotCaptureOptions, ScreenshotSource } from '@plugins/visual/support/screenshot-source';

export class AppiumScreenshotSource implements ScreenshotSource {
    async capture(options: ScreenshotCaptureOptions): Promise<Buffer> {
        const driver = getActiveDriver(options.sessionId ?? '0');

        if (options.regionSelector) {
            try {
                const element = driver.$(options.regionSelector);
                const isDisplayed = await (element.isDisplayed() as Promise<boolean>).catch(() => false);
                if (isDisplayed) {
                    const elementId = await element.elementId;
                    const elementShot = await driver.takeElementScreenshot(elementId);
                    return Buffer.from(elementShot, 'base64');
                }
            } catch (err) {
                process.stderr.write(
                    `[visual:appium] region '${options.regionSelector}' not capturable, ` +
                    `falling back to full screen: ${(err as Error).message}\n`,
                );
            }
        }

        const fullScreen = await driver.takeScreenshot();
        return Buffer.from(fullScreen, 'base64');
    }
}
