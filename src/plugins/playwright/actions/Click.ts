import { ActionHandler } from '@plugins/shared/ActionHandler';
import { PlaywrightActionContext } from '@plugins/playwright/actions/PlaywrightActionContext';

export const ClickAction: ActionHandler<PlaywrightActionContext> = {
    name: 'CLICK',
    async execute({ page, target }) {
        await page.click(target);
        return `Click executed on element: ${target}`;
    },
};
