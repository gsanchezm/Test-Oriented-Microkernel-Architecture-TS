import { ActionHandler } from '@plugins/shared/ActionHandler';
import { parseSelectorTimeout } from '@plugins/shared/parseCompositeTarget';
import { WebUiActionContext } from '@plugins/web-ui/actions/WebUiActionContext';

export const WaitForElementAction: ActionHandler<WebUiActionContext> = {
    name: 'WAIT_FOR_ELEMENT',
    async execute({ page, target }) {
        const { selector, timeoutMs } = parseSelectorTimeout(target, 5000);
        await page.locator(selector).waitFor({ state: 'visible', timeout: timeoutMs });
        return `Element visible: ${selector}`;
    },
};
