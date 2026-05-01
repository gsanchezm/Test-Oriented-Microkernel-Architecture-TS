import { ActionHandler } from '@plugins/actions/ActionHandler';
import { AppiumActionContext } from '@plugins/actions/appium/AppiumActionContext';

export const EvaluateAction: ActionHandler<AppiumActionContext> = {
    name: 'EVALUATE',
    async execute({ driver, target }) {
        const result = await driver.execute(target);
        return result !== undefined ? String(result) : '';
    },
};
