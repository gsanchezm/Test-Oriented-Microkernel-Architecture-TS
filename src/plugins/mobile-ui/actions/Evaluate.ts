import { ActionHandler } from '@plugins/shared/ActionHandler';
import { MobileUiActionContext } from '@plugins/mobile-ui/actions/MobileUiActionContext';

export const EvaluateAction: ActionHandler<MobileUiActionContext> = {
    name: 'EVALUATE',
    async execute({ driver, target }) {
        const result = await driver.execute(target);
        return result !== undefined ? String(result) : '';
    },
};
