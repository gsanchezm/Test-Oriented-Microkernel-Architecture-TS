import { ActionHandler } from '@plugins/actions/ActionHandler';
import { PlaywrightActionContext } from '@plugins/actions/playwright/PlaywrightActionContext';

export const NavigateAction: ActionHandler<PlaywrightActionContext> = {
    name: 'NAVIGATE',
    async execute({ page, target }) {
        await page.goto(target, { waitUntil: 'domcontentloaded' });
        return `Navigated successfully to ${target}`;
    },
};
