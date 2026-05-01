import { ActionRegistry } from '@plugins/actions/ActionRegistry';
import { WebUiActionContext } from '@plugins/actions/web-ui/WebUiActionContext';
import { NavigateAction } from '@plugins/actions/web-ui/Navigate';
import { ClickAction } from '@plugins/actions/web-ui/Click';
import { TypeAction } from '@plugins/actions/web-ui/Type';
import { ReadTextAction } from '@plugins/actions/web-ui/ReadText';
import { WaitForElementAction } from '@plugins/actions/web-ui/WaitForElement';
import { AssertTextAction } from '@plugins/actions/web-ui/AssertText';
import { ScrollToAction } from '@plugins/actions/web-ui/ScrollTo';
import { EvaluateAction } from '@plugins/actions/web-ui/Evaluate';

let cachedRegistry: ActionRegistry<WebUiActionContext> | null = null;

export function getWebUiActionRegistry(): ActionRegistry<WebUiActionContext> {
    if (cachedRegistry) return cachedRegistry;

    const registry = new ActionRegistry<WebUiActionContext>({ plugin: 'web-ui' });
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
