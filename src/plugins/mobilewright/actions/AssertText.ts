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
        if (actual !== expected) {
            throw new Error(
                `[ASSERT_TEXT] mobilewright element ${strategy.kind}=${strategy.value} ` +
                `expected "${expected}" but got "${actual}"`,
            );
        }
        return `Asserted text "${expected}" on mobilewright element: ${strategy.kind}=${strategy.value}`;
    },
};
