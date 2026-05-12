import { ActionHandler } from '@plugins/shared/ActionHandler';
import { AppiumActionContext } from '@plugins/appium/actions/AppiumActionContext';

export const EvaluateAction: ActionHandler<AppiumActionContext> = {
    name: 'EVALUATE',
    async execute({ driver, target }) {
        const result = await driver.execute(target);
        return result !== undefined ? String(result) : '';
    },
};
