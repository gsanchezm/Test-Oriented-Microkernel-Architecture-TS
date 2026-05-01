import { ActionHandler } from '@plugins/actions/ActionHandler';
import { WebUiActionContext } from '@plugins/actions/web-ui/WebUiActionContext';

export const ReadTextAction: ActionHandler<WebUiActionContext> = {
    name: 'READ_TEXT',
    async execute({ page, target }) {
        const texts = await page.locator(target).allTextContents();
        return texts.join('\n');
    },
};
