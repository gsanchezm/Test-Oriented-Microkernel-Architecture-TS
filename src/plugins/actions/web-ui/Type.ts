import { ActionHandler } from '@plugins/actions/ActionHandler';
import { parseSelectorValue } from '@plugins/actions/parseCompositeTarget';
import { WebUiActionContext } from '@plugins/actions/web-ui/WebUiActionContext';

export const TypeAction: ActionHandler<WebUiActionContext> = {
    name: 'TYPE',
    async execute({ page, target }) {
        const { selector, value } = parseSelectorValue(target, 'TYPE action');
        await page.fill(selector, value);
        return `Typed text into element: ${selector}`;
    },
};
