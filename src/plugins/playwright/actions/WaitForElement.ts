import { ActionHandler } from '@plugins/shared/ActionHandler';
import { parseSelectorTimeout } from '@plugins/shared/parseCompositeTarget';
import { PlaywrightActionContext } from '@plugins/playwright/actions/PlaywrightActionContext';

export const WaitForElementAction: ActionHandler<PlaywrightActionContext> = {
    name: 'WAIT_FOR_ELEMENT',
    async execute({ page, target }) {
        const { selector, timeoutMs } = parseSelectorTimeout(target, 5000);
        // Use `.first()` so list locators (e.g. `[data-testid^='size-']` for
        // sizeOptionsList) don't trip Playwright's strict-mode 1-element
        // constraint. For unique selectors `.first()` is a no-op.
        await page.locator(selector).first().waitFor({ state: 'visible', timeout: timeoutMs });
        return `Element visible: ${selector}`;
    },
};
