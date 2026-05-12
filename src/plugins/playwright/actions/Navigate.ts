import { ActionHandler } from '@plugins/shared/ActionHandler';
import { PlaywrightActionContext } from '@plugins/playwright/actions/PlaywrightActionContext';

export const NavigateAction: ActionHandler<PlaywrightActionContext> = {
    name: 'NAVIGATE',
    async execute({ page, target }) {
        await page.goto(target, { waitUntil: 'domcontentloaded' });
        return `Navigated successfully to ${target}`;
    },
};
