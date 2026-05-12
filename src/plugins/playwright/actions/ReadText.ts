import { ActionHandler } from '@plugins/shared/ActionHandler';
import { PlaywrightActionContext } from '@plugins/playwright/actions/PlaywrightActionContext';

export const ReadTextAction: ActionHandler<PlaywrightActionContext> = {
    name: 'READ_TEXT',
    async execute({ page, target }) {
        const texts = await page.locator(target).allTextContents();
        return texts.join('\n');
    },
};
