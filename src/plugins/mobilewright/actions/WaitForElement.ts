import { ActionHandler } from '@plugins/shared/ActionHandler';
import { parseSelectorTimeout } from '@plugins/shared/parseCompositeTarget';
import {
    MobilewrightActionContext,
    parseLocator,
    locate,
} from '@plugins/mobilewright/actions/MobilewrightActionContext';

const DEFAULT_TIMEOUT_MS = 30_000;

export const WaitForElementAction: ActionHandler<MobilewrightActionContext> = {
    name: 'WAIT_FOR_ELEMENT',
    async execute({ driver, target }) {
        // Composite form `selector||timeoutMs` is supported by all plugins.
        let selector = target;
        let timeoutMs = DEFAULT_TIMEOUT_MS;
        if (target.includes('||')) {
            const parsed = parseSelectorTimeout(target, DEFAULT_TIMEOUT_MS);
            selector = parsed.selector;
            timeoutMs = parsed.timeoutMs;
        }
        const strategy = parseLocator(selector);
        const locator = await locate(driver, strategy);
        await locator.waitFor({ state: 'visible', timeout: timeoutMs });
        return `Mobilewright element visible: ${strategy.kind}=${strategy.value}`;
    },
};
