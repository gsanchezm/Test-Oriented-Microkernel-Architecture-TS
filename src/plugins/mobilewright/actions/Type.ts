import { ActionHandler } from '@plugins/shared/ActionHandler';
import { parseSelectorValue } from '@plugins/shared/parseCompositeTarget';
import {
    MobilewrightActionContext,
    parseLocator,
    locate,
} from '@plugins/mobilewright/actions/MobilewrightActionContext';

export const TypeAction: ActionHandler<MobilewrightActionContext> = {
    name: 'TYPE',
    async execute({ driver, target }) {
        const { selector, value } = parseSelectorValue(target, 'TYPE action');
        const strategy = parseLocator(selector);
        const locator = await locate(driver, strategy);
        await locator.scrollIntoViewIfNeeded();
        await locator.tap(); // focus the field
        await locator.fill(value);
        return `Typed into mobilewright element: ${strategy.kind}=${strategy.value}`;
    },
};
