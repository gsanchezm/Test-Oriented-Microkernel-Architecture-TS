import { ActionRegistry } from '@plugins/actions/ActionRegistry';
import { PlaywrightActionContext } from '@plugins/actions/playwright/PlaywrightActionContext';
import { NavigateAction } from '@plugins/actions/playwright/Navigate';
import { ClickAction } from '@plugins/actions/playwright/Click';
import { TypeAction } from '@plugins/actions/playwright/Type';
import { ReadTextAction } from '@plugins/actions/playwright/ReadText';
import { WaitForElementAction } from '@plugins/actions/playwright/WaitForElement';
import { AssertTextAction } from '@plugins/actions/playwright/AssertText';
import { ScrollToAction } from '@plugins/actions/playwright/ScrollTo';
import { EvaluateAction } from '@plugins/actions/playwright/Evaluate';

let cachedRegistry: ActionRegistry<PlaywrightActionContext> | null = null;

export function getPlaywrightActionRegistry(): ActionRegistry<PlaywrightActionContext> {
    if (cachedRegistry) return cachedRegistry;

    const registry = new ActionRegistry<PlaywrightActionContext>({ plugin: 'playwright' });
    registry
        .register(NavigateAction)
        .register(ClickAction)
        .register(TypeAction)
        .register(ReadTextAction)
        .register(WaitForElementAction)
        .register(AssertTextAction)
        .register(ScrollToAction)
        .register(EvaluateAction);

    cachedRegistry = registry;
    return registry;
}

export function resetPlaywrightActionRegistry(): void {
    cachedRegistry = null;
}
