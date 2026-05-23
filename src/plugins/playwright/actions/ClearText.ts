import { ActionHandler } from '@plugins/shared/ActionHandler';
import { PlaywrightActionContext } from '@plugins/playwright/actions/PlaywrightActionContext';

export const ClearTextAction: ActionHandler<PlaywrightActionContext> = {
    name: 'CLEAR_TEXT',
    async execute({ page, target }) {
        await page.fill(target, '');
        return `Cleared text in element: ${target}`;
    },
};
