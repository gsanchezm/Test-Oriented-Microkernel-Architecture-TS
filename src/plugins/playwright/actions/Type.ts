import { ActionHandler } from '@plugins/shared/ActionHandler';
import { parseSelectorValue } from '@plugins/shared/parseCompositeTarget';
import { PlaywrightActionContext } from '@plugins/playwright/actions/PlaywrightActionContext';

export const TypeAction: ActionHandler<PlaywrightActionContext> = {
    name: 'TYPE',
    async execute({ page, target }) {
        const { selector, value } = parseSelectorValue(target, 'TYPE action');
        await page.fill(selector, value);
        return `Typed text into element: ${selector}`;
    },
};
