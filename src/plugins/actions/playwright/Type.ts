import { ActionHandler } from '@plugins/actions/ActionHandler';
import { parseSelectorValue } from '@plugins/actions/parseCompositeTarget';
import { PlaywrightActionContext } from '@plugins/actions/playwright/PlaywrightActionContext';

export const TypeAction: ActionHandler<PlaywrightActionContext> = {
    name: 'TYPE',
    async execute({ page, target }) {
        const { selector, value } = parseSelectorValue(target, 'TYPE action');
        await page.fill(selector, value);
        return `Typed text into element: ${selector}`;
    },
};
