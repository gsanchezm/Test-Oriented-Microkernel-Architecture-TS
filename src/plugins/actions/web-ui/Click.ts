import { ActionHandler } from '@plugins/actions/ActionHandler';
import { WebUiActionContext } from '@plugins/actions/web-ui/WebUiActionContext';

export const ClickAction: ActionHandler<WebUiActionContext> = {
    name: 'CLICK',
    async execute({ page, target }) {
        await page.click(target);
        return `Click executed on element: ${target}`;
    },
};
