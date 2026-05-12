import { ActionHandler } from '@plugins/shared/ActionHandler';
import { AppiumActionContext } from '@plugins/appium/actions/AppiumActionContext';

export const NavigateAction: ActionHandler<AppiumActionContext> = {
    name: 'NAVIGATE',
    async execute({ driver, target }) {
        await driver.url(target);
        return `Navigated to ${target}`;
    },
};
