import { ActionRegistry } from '@plugins/shared/ActionRegistry';
import { MobilewrightActionContext } from '@plugins/mobilewright/actions/MobilewrightActionContext';
import { NavigateAction } from '@plugins/mobilewright/actions/Navigate';
import { ClickAction } from '@plugins/mobilewright/actions/Click';
import { TypeAction } from '@plugins/mobilewright/actions/Type';
import { ClearTextAction } from '@plugins/mobilewright/actions/ClearText';
import { AssertTextAction } from '@plugins/mobilewright/actions/AssertText';
import { WaitForElementAction } from '@plugins/mobilewright/actions/WaitForElement';

let cachedRegistry: ActionRegistry<MobilewrightActionContext> | null = null;

export function getMobilewrightActionRegistry(): ActionRegistry<MobilewrightActionContext> {
    if (cachedRegistry) return cachedRegistry;

    const registry = new ActionRegistry<MobilewrightActionContext>({ plugin: 'mobilewright' });
    registry
        .register(NavigateAction)
        .register(ClickAction)
        .register(TypeAction)
        .register(ClearTextAction)
        .register(AssertTextAction)
        .register(WaitForElementAction);

    cachedRegistry = registry;
    return registry;
}

export function resetMobilewrightActionRegistry(): void {
    cachedRegistry = null;
}
