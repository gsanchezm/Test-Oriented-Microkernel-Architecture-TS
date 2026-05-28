import { ActionHandler } from '@plugins/shared/ActionHandler';
import { AppiumActionContext } from '@plugins/appium/actions/AppiumActionContext';

// Captures a full-screen screenshot from the active Appium session and
// returns it as a base64-encoded string in the response payload. Used by
// the failure screenshot hook (`failure-screenshot.hooks.ts`). WebdriverIO's
// `takeScreenshot()` already returns base64, so no re-encoding is required.
// No locator target is consumed.
export const ScreenshotAction: ActionHandler<AppiumActionContext> = {
    name: 'SCREENSHOT',
    async execute({ driver }) {
        return await driver.takeScreenshot();
    },
};
