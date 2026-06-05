import { ActionHandler } from '@plugins/shared/ActionHandler';
import { AppiumActionContext } from '@plugins/appium/actions/AppiumActionContext';

export const ScrollToAction: ActionHandler<AppiumActionContext> = {
    name: 'SCROLL_TO',
    async execute({ driver, target, platform }) {
        try {
            await driver.$(target).scrollIntoView();
            // On iOS `scrollIntoView()` assumes a vertical container and
            // silently no-ops on HORIZONTAL lists, so confirm the target is
            // actually on-screen; if not, fall through to the native
            // scroll-to-element idiom below. On Android a clean call is enough.
            if (platform !== 'ios' || (await driver.$(target).isDisplayed().catch(() => false))) {
                return `Scrolled to: ${target}`;
            }
        } catch (err) {
            const msg = (err as Error)?.message ?? '';
            // WDIO's scrollIntoView assumes a default `//android.widget.ScrollView`.
            // Some React Native screens (e.g. the profile form) don't expose that
            // container, so it throws "Default scrollable element ... was not
            // found". Fall back to a platform-appropriate scroll below.
            // Re-throw any other (genuine) failure.
            if (!/scrollable element|ScrollView|not found/i.test(msg)) throw err;
        }

        // iOS: use the native scroll-to-element idiom. It infers the scroll
        // axis/direction (so it also handles HORIZONTAL lists like the catalog
        // category pills, where wide localized labels — es: "Vegetariana",
        // "Carnes" — push later pills past the right edge) and needs no tuned
        // coordinates. The element exposes `name == "<testID>"` on iOS because
        // getTestProps maps testID -> accessibilityIdentifier -> XCUI `name`.
        // (Root cause of BUG-OMNI-001's MX/meat false positive: the off-screen
        // pill was never scrolled in, so CLICK's coordinate tap — X clamped to
        // the screen edge — missed and the category filter never engaged.)
        if (platform === 'ios') {
            const name = target.startsWith('~') ? target.slice(1) : target;
            try {
                await driver.execute('mobile: scroll', { predicateString: `name == "${name}"` });
                return `Scrolled to (ios mobile:scroll): ${target}`;
            } catch (err) {
                // Best-effort: leave final visibility to the caller's
                // WAIT_FOR_ELEMENT / CLICK rather than failing the scroll itself.
                return `Scroll attempted (ios mobile:scroll failed: ${(err as Error)?.message ?? ''}): ${target}`;
            }
        }

        // Android (UiAutomator2) gesture fallback — a screen-level scroll that
        // doesn't depend on the ScrollView class, re-checking visibility
        // between swipes.
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
    },
};
