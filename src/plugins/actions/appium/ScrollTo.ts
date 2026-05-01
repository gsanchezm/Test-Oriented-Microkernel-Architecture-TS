import { ActionHandler } from '@plugins/actions/ActionHandler';
import { AppiumActionContext } from '@plugins/actions/appium/AppiumActionContext';

export const ScrollToAction: ActionHandler<AppiumActionContext> = {
    name: 'SCROLL_TO',
    async execute({ driver, target }) {
        await driver.$(target).scrollIntoView();
        return `Scrolled to: ${target}`;
    },
};
