import { ActionHandler } from '@plugins/actions/ActionHandler';
import { WebUiActionContext } from '@plugins/actions/web-ui/WebUiActionContext';

export const EvaluateAction: ActionHandler<WebUiActionContext> = {
    name: 'EVALUATE',
    async execute({ page, target }) {
        const result = await page.evaluate(target);
        return result !== undefined ? String(result) : '';
    },
};
