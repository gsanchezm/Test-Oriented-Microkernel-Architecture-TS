import { ActionHandler } from '@plugins/shared/ActionHandler';
import { AppiumActionContext } from '@plugins/appium/actions/AppiumActionContext';

export const ClickAction: ActionHandler<AppiumActionContext> = {
    name: 'CLICK',
    async execute({ driver, target, platform, helpers }) {
        const t0 = Date.now();
        const dbg = (phase: string) =>
            process.stderr.write(`[Appium-DBG] CLICK ${target} ${phase} t+${Date.now() - t0}ms\n`);
        dbg('enter');
        const element = driver.$(target);
        // Dismiss first so the click can't land on a keyboard key. On the
        // checkout page XCUI's isDisplayed returns true for buttons that
        // sit under the keyboard, so a tap at the button's hit-point would
        // land on a keyboard key.
        await helpers.dismissKeyboard(driver);
        await helpers.blurActiveTextInput(driver);
        dbg('post-dismiss');
        await helpers.scrollIntoViewSafe(driver, element, target);
        dbg('post-scroll');
        // The scroll loop uses touch-based `mobile: swipe` which can graze
        // a TextInput and reopen the keyboard. Dismiss again before the tap.
        await helpers.dismissKeyboard(driver);
        dbg('post-dismiss2');

        if (platform === 'ios') {
            try {
                const loc = await (element.getLocation() as Promise<{ x: number; y: number }>);
                const size = await (element.getSize() as Promise<{ width: number; height: number }>);
                const centerX = loc.x + size.width / 2;
                const centerY = loc.y + size.height / 2;
                process.stderr.write(
                    `[Appium-DBG] CLICK ${target} frame=(${loc.x},${loc.y},${size.width}x${size.height}) center=(${centerX},${centerY})\n`,
                );
                const windowSize = await driver.getWindowSize();
                const VIEWPORT_BOTTOM = Math.min(windowSize.height - 90, 780);
                if (target.includes('btn-place-order') || centerY > VIEWPORT_BOTTOM) {
                    // The JP credit-card form keeps `input-card-number` focused, so the
                    // numeric keypad stays up and btn-place-order renders UNDER it. A
                    // coordinate OR native tap at the button center then lands on a
                    // keyboard key (the '8'), typing a stray digit and never pressing
                    // the button (proven: card 16→17 at the tap; a native element.click()
                    // reproduced the same '8' — changing tap *delivery* can't help). The
                    // only fix is to actually DISMISS the pad first: the generic
                    // dismissKeyboard taps at y≈120/150, which on this scrolled layout
                    // land on the card field itself and fail; dismissNumericKeyboardRobust
                    // targets neutral content above the keyboard instead. Once the pad is
                    // gone the button is no longer occluded and the clamped tap below hits
                    // it. (If no gesture dismisses the pad, that is an app UX bug — the
                    // per-strategy KBDISMISS logs make that case visible.)
                    if (target.includes('btn-place-order') && (await helpers.isKeyboardShown(driver))) {
                        const dismissed = await helpers.dismissNumericKeyboardRobust(driver);
                        process.stderr.write(`[Appium-DBG] CLICK ${target} robust-dismiss dismissed=${dismissed}\n`);
                        dbg('post-robust-dismiss');
                    }
                    const clampedY = Math.min(Math.max(65, centerY), VIEWPORT_BOTTOM - 10);
                    // If the clamp ceiling falls ABOVE the element's own top edge,
                    // a clamped coordinate tap lands outside (above) the element and
                    // silently misses it. Observed for `~btn-add-to-cart`, the
                    // builder's bottom CTA in the safe-area zone: center y=818,
                    // clamp→770, element top=792 → tap above the button → the add
                    // never fires, the cart never updates, and the navbar badge
                    // stays empty (root cause of the 5 navbar-cart-count failures).
                    // The clamp exists to dodge the keyboard on btn-place-order;
                    // when it would miss, defer to WDA's native element click, which
                    // resolves the element's own hittable midpoint.
                    if (clampedY < loc.y) {
                        process.stderr.write(`[Appium-DBG] CLICK ${target} clamp(${clampedY})<elemTop(${loc.y}) -> native element.click()\n`);
                        await (element.click() as Promise<void>);
                        dbg('post-click(native-fallback)');
                        return `Tapped (native; clamp would miss) on mobile element: ${target}`;
                    }
                    process.stderr.write(`[Appium-DBG] CLICK ${target} tap-clamped at (${centerX},${clampedY})\n`);
                    await driver.executeScript('mobile: tap', [{ x: centerX, y: clampedY }]);
                    dbg('post-click(clamped)');
                    return `Tapped (clamped) on mobile element: ${target}`;
                }
                await helpers.tapElementCenter(driver, element);
                dbg('post-click(coords)');
                return `Tapped on mobile element by coordinates: ${target}`;
            } catch (err) {
                process.stderr.write(`[Appium-DBG] CLICK ${target} frame lookup failed: ${(err as Error).message}\n`);
            }
        }

        await (element.click() as Promise<void>);
        dbg('post-click');
        return `Tapped on mobile element: ${target}`;
    },
};
