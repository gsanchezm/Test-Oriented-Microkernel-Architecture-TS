import { ActionHandler } from '@plugins/actions/ActionHandler';
import { parseSelectorTimeout } from '@plugins/actions/parseCompositeTarget';
import { PlaywrightActionContext } from '@plugins/actions/playwright/PlaywrightActionContext';

export const WaitForElementAction: ActionHandler<PlaywrightActionContext> = {
    name: 'WAIT_FOR_ELEMENT',
    async execute({ page, target }) {
        const { selector, timeoutMs } = parseSelectorTimeout(target, 5000);
        await page.locator(selector).waitFor({ state: 'visible', timeout: timeoutMs });
        return `Element visible: ${selector}`;
    },
};
