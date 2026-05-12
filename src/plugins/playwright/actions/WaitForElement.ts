import { ActionHandler } from '@plugins/shared/ActionHandler';
import { parseSelectorTimeout } from '@plugins/shared/parseCompositeTarget';
import { PlaywrightActionContext } from '@plugins/playwright/actions/PlaywrightActionContext';

export const WaitForElementAction: ActionHandler<PlaywrightActionContext> = {
    name: 'WAIT_FOR_ELEMENT',
    async execute({ page, target }) {
        const { selector, timeoutMs } = parseSelectorTimeout(target, 5000);
        await page.locator(selector).waitFor({ state: 'visible', timeout: timeoutMs });
        return `Element visible: ${selector}`;
    },
};
