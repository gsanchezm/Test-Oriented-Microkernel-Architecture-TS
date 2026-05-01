import { ActionHandler } from '@plugins/shared/ActionHandler';
import { WebUiActionContext } from '@plugins/web-ui/actions/WebUiActionContext';

export const ClickAction: ActionHandler<WebUiActionContext> = {
    name: 'CLICK',
    async execute({ page, target }) {
        await page.click(target);
        return `Click executed on element: ${target}`;
    },
};
