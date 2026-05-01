import { ActionHandler } from '@plugins/actions/ActionHandler';
import { MobileUiActionContext } from '@plugins/actions/mobile-ui/MobileUiActionContext';

export const EvaluateAction: ActionHandler<MobileUiActionContext> = {
    name: 'EVALUATE',
    async execute({ driver, target }) {
        const result = await driver.execute(target);
        return result !== undefined ? String(result) : '';
    },
};
