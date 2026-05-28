import { ActionHandler } from '@plugins/shared/ActionHandler';
import { PlaywrightActionContext } from '@plugins/playwright/actions/PlaywrightActionContext';

// Captures a full-page PNG from the active Playwright page and returns it
// as a base64-encoded string in the response payload. Used by the failure
// screenshot hook (`failure-screenshot.hooks.ts`) to attach a PNG to the
// cucumber report on scenario failure. No locator target is consumed.
export const ScreenshotAction: ActionHandler<PlaywrightActionContext> = {
    name: 'SCREENSHOT',
    async execute({ page }) {
        const pngBuffer = await page.screenshot({ type: 'png', fullPage: true });
        return pngBuffer.toString('base64');
    },
};
