import { ActionHandler } from '@plugins/actions/ActionHandler';
import { AppiumActionContext } from '@plugins/actions/appium/AppiumActionContext';

export const NavigateAction: ActionHandler<AppiumActionContext> = {
    name: 'NAVIGATE',
    async execute({ driver, target }) {
        await driver.url(target);
        return `Navigated to ${target}`;
    },
};
