import { ActionRegistry } from '@plugins/shared/ActionRegistry';
import { PlaywrightActionContext } from '@plugins/playwright/actions/PlaywrightActionContext';
import { NavigateAction } from '@plugins/playwright/actions/Navigate';
import { ClickAction } from '@plugins/playwright/actions/Click';
import { TypeAction } from '@plugins/playwright/actions/Type';
import { ReadTextAction } from '@plugins/playwright/actions/ReadText';
import { WaitForElementAction } from '@plugins/playwright/actions/WaitForElement';
import { AssertTextAction } from '@plugins/playwright/actions/AssertText';
import { ScrollToAction } from '@plugins/playwright/actions/ScrollTo';
import { EvaluateAction } from '@plugins/playwright/actions/Evaluate';

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
