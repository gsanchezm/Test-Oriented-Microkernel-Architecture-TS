// Factory that resolves the right ScreenshotSource for a given platform
// without baking the choice into individual action handlers. Tests can
// replace this map with stubs by reassigning `screenshotSourceRegistry`.

import { ScreenshotSource } from '@plugins/visual/support/screenshot-source';
import { PlaywrightScreenshotSource } from '@plugins/visual/support/playwright-screenshot-source';
import { AppiumScreenshotSource } from '@plugins/visual/support/appium-screenshot-source';

export const screenshotSourceRegistry: Record<string, () => ScreenshotSource> = {
    web: () => new PlaywrightScreenshotSource(),
    desktop: () => new PlaywrightScreenshotSource(),
    responsive: () => new PlaywrightScreenshotSource(),
    android: () => new AppiumScreenshotSource(),
    ios: () => new AppiumScreenshotSource(),
    mobile: () => new AppiumScreenshotSource(),
};

export function resolveScreenshotSource(platform: string): ScreenshotSource {
    const key = (platform || '').toLowerCase();
    const factory = screenshotSourceRegistry[key];
    if (!factory) {
        throw new Error(
            `[visual] No screenshot source registered for platform='${platform}'. ` +
            `Available: ${Object.keys(screenshotSourceRegistry).join(', ')}.`,
        );
    }
    return factory();
}
