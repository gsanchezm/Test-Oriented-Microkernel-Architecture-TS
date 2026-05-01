import { ActionHandler } from '@plugins/actions/ActionHandler';
import { PlaywrightActionContext } from '@plugins/actions/playwright/PlaywrightActionContext';

export const ClickAction: ActionHandler<PlaywrightActionContext> = {
    name: 'CLICK',
    async execute({ page, target }) {
        await page.click(target);
        return `Click executed on element: ${target}`;
    },
};
