import { ActionHandler } from '@plugins/actions/ActionHandler';
import { WebUiActionContext } from '@plugins/actions/web-ui/WebUiActionContext';

export const NavigateAction: ActionHandler<WebUiActionContext> = {
    name: 'NAVIGATE',
    async execute({ page, target }) {
        await page.goto(target, { waitUntil: 'domcontentloaded' });
        return `Navigated successfully to ${target}`;
    },
};
