import { ActionHandler } from '@plugins/actions/ActionHandler';
import { parseSelectorValue } from '@plugins/actions/parseCompositeTarget';
import { PlaywrightActionContext } from '@plugins/actions/playwright/PlaywrightActionContext';

export const AssertTextAction: ActionHandler<PlaywrightActionContext> = {
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
