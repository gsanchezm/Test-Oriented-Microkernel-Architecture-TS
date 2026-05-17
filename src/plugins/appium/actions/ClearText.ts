import { ActionHandler } from '@plugins/shared/ActionHandler';
import { AppiumActionContext } from '@plugins/appium/actions/AppiumActionContext';

export const ClearTextAction: ActionHandler<AppiumActionContext> = {
    name: 'CLEAR_TEXT',
    async execute({ driver, target, helpers }) {
        const selector = target;
        const element = driver.$(selector);
        await helpers.scrollIntoViewSafe(driver, element, selector, 5);
        if (!(await helpers.isFrameInTapZone(driver, element))) {
            await helpers.dismissKeyboard(driver);
            await helpers.scrollIntoViewSafe(driver, element, selector, 3);
        }
        await (element.click() as Promise<void>);
        await (element.clearValue() as Promise<void>).catch(() => undefined);
        await helpers.dismissKeyboard(driver);
        return `Cleared text in mobile element: ${selector}`;
    },
};
