import { ActionHandler } from '@plugins/shared/ActionHandler';
import { WebUiActionContext } from '@plugins/web-ui/actions/WebUiActionContext';

export const EvaluateAction: ActionHandler<WebUiActionContext> = {
    name: 'EVALUATE',
    async execute({ page, target }) {
        const result = await page.evaluate(target);
        return result !== undefined ? String(result) : '';
    },
};
