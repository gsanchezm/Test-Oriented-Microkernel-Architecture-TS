import { ActionHandler } from '@plugins/shared/ActionHandler';
import { parseSelectorValue } from '@plugins/shared/parseCompositeTarget';
import { WebUiActionContext } from '@plugins/web-ui/actions/WebUiActionContext';

export const AssertTextAction: ActionHandler<WebUiActionContext> = {
    name: 'ASSERT_TEXT',
    async execute({ page, target }) {
        const { selector, value: expected } = parseSelectorValue(target, 'ASSERT_TEXT action');
        const actual = await page.locator(selector).innerText();
        if (actual !== expected) {
            throw new Error(
                `[ASSERT_TEXT] Mismatch on "${selector}": expected "${expected}", got "${actual}"`,
            );
        }
        return actual;
    },
};
