import { ActionHandler } from '@plugins/shared/ActionHandler';
import { PlaywrightActionContext } from '@plugins/playwright/actions/PlaywrightActionContext';

export const EvaluateAction: ActionHandler<PlaywrightActionContext> = {
    name: 'EVALUATE',
    async execute({ page, target }) {
        const result = await page.evaluate(target);
        return result !== undefined ? String(result) : '';
    },
};
