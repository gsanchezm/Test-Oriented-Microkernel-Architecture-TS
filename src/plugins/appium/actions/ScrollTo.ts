import { ActionHandler } from '@plugins/shared/ActionHandler';
import { AppiumActionContext } from '@plugins/appium/actions/AppiumActionContext';

export const ScrollToAction: ActionHandler<AppiumActionContext> = {
    name: 'SCROLL_TO',
    async execute({ driver, target }) {
        try {
            await driver.$(target).scrollIntoView();
            return `Scrolled to: ${target}`;
        } catch (err) {
            const msg = (err as Error)?.message ?? '';
            // WDIO's scrollIntoView assumes a default `//android.widget.ScrollView`.
            // Some React Native screens (e.g. the profile form) don't expose that
            // container, so it throws "Default scrollable element ... was not
            // found". Fall back to a screen-level UiAutomator2 scroll gesture that
            // doesn't depend on the ScrollView class, re-checking visibility
            // between swipes. Re-throw any other (genuine) failure.
            if (!/scrollable element|ScrollView|not found/i.test(msg)) throw err;

            const { width, height } = await driver.getWindowSize();
            const region = {
                left: Math.round(width * 0.1),
                top: Math.round(height * 0.25),
                width: Math.round(width * 0.8),
                height: Math.round(height * 0.5),
            };
            for (let i = 0; i < 4; i++) {
                if (await driver.$(target).isDisplayed().catch(() => false)) break;
                await driver.execute('mobile: scrollGesture', {
                    ...region,
                    direction: 'down',
                    percent: 0.85,
                });
            }
            return `Scrolled to (gesture fallback): ${target}`;
        }
    },
};
