import { ActionHandler } from '@plugins/shared/ActionHandler';
import { AppiumActionContext } from '@plugins/appium/actions/AppiumActionContext';

export const ScrollToAction: ActionHandler<AppiumActionContext> = {
    name: 'SCROLL_TO',
    async execute({ driver, target }) {
        await driver.$(target).scrollIntoView();
        return `Scrolled to: ${target}`;
    },
};
