import { ActionHandler } from '@plugins/shared/ActionHandler';
import { parseSelectorValue } from '@plugins/shared/parseCompositeTarget';
import { PlaywrightActionContext } from '@plugins/playwright/actions/PlaywrightActionContext';

export const AssertTextAction: ActionHandler<PlaywrightActionContext> = {
    name: 'ASSERT_TEXT',
    async execute({ page, target }) {
        const { selector, value: expected } = parseSelectorValue(target, 'ASSERT_TEXT action');
        const actual = await page.locator(selector).innerText();
        // Case/whitespace-insensitive: label casing is presentation, not
        // semantics (web CSS text-transform uppercases; native renders as-is),
        // so "FULL NAME" (web innerText) and "Full name" (native) both match.
        if (actual.trim().toLowerCase() !== expected.trim().toLowerCase()) {
            throw new Error(
                `[ASSERT_TEXT] Mismatch on "${selector}": expected "${expected}", got "${actual}"`,
            );
        }
        return actual;
    },
};
