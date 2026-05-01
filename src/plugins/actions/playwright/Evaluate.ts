import { ActionHandler } from '@plugins/actions/ActionHandler';
import { PlaywrightActionContext } from '@plugins/actions/playwright/PlaywrightActionContext';

export const EvaluateAction: ActionHandler<PlaywrightActionContext> = {
    name: 'EVALUATE',
    async execute({ page, target }) {
        const result = await page.evaluate(target);
        return result !== undefined ? String(result) : '';
    },
};
