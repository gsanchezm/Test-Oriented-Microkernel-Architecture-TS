import { ActionHandler } from '@plugins/shared/ActionHandler';
import {
    MobilewrightActionContext,
    parseLocator,
    locate,
} from '@plugins/mobilewright/actions/MobilewrightActionContext';

export const ClearTextAction: ActionHandler<MobilewrightActionContext> = {
    name: 'CLEAR_TEXT',
    async execute({ driver, target }) {
        const strategy = parseLocator(target);
        const locator = await locate(driver, strategy);
        await locator.scrollIntoViewIfNeeded();
        await locator.tap();
        await locator.fill('');
        return `Cleared text in mobilewright element: ${strategy.kind}=${strategy.value}`;
    },
};
