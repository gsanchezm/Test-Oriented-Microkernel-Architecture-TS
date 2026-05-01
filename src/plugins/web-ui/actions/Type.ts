import { ActionHandler } from '@plugins/shared/ActionHandler';
import { parseSelectorValue } from '@plugins/shared/parseCompositeTarget';
import { WebUiActionContext } from '@plugins/web-ui/actions/WebUiActionContext';

export const TypeAction: ActionHandler<WebUiActionContext> = {
    name: 'TYPE',
    async execute({ page, target }) {
        const { selector, value } = parseSelectorValue(target, 'TYPE action');
        await page.fill(selector, value);
        return `Typed text into element: ${selector}`;
    },
};
