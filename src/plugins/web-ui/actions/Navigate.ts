import { ActionHandler } from '@plugins/shared/ActionHandler';
import { WebUiActionContext } from '@plugins/web-ui/actions/WebUiActionContext';

export const NavigateAction: ActionHandler<WebUiActionContext> = {
    name: 'NAVIGATE',
    async execute({ page, target }) {
        await page.goto(target, { waitUntil: 'domcontentloaded' });
        return `Navigated successfully to ${target}`;
    },
};
