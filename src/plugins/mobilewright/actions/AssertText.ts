import { ActionHandler } from '@plugins/shared/ActionHandler';
import { parseSelectorValue } from '@plugins/shared/parseCompositeTarget';
import {
    MobilewrightActionContext,
    parseLocator,
    locate,
} from '@plugins/mobilewright/actions/MobilewrightActionContext';

export const AssertTextAction: ActionHandler<MobilewrightActionContext> = {
    name: 'ASSERT_TEXT',
    async execute({ driver, target }) {
        const { selector, value: expected } = parseSelectorValue(target, 'ASSERT_TEXT action');
        const strategy = parseLocator(selector);
        const locator = await locate(driver, strategy);
        const actual = await locator.getText();
        // Case/whitespace-insensitive: label casing is presentation, not
        // semantics (web CSS text-transform uppercases; native renders as-is),
        // so "FULL NAME" (web innerText) and "Full name" (native) both match.
        if (actual.trim().toLowerCase() !== expected.trim().toLowerCase()) {
            throw new Error(
                `[ASSERT_TEXT] mobilewright element ${strategy.kind}=${strategy.value} ` +
                `expected "${expected}" but got "${actual}"`,
            );
        }
        return `Asserted text "${expected}" on mobilewright element: ${strategy.kind}=${strategy.value}`;
    },
};
