import { ActionHandler } from '@plugins/shared/ActionHandler';
import { WebUiActionContext } from '@plugins/web-ui/actions/WebUiActionContext';

export const ReadTextAction: ActionHandler<WebUiActionContext> = {
    name: 'READ_TEXT',
    async execute({ page, target }) {
        const texts = await page.locator(target).allTextContents();
        return texts.join('\n');
    },
};
