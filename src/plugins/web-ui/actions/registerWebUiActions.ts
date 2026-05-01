import { ActionRegistry } from '@plugins/shared/ActionRegistry';
import { WebUiActionContext } from '@plugins/web-ui/actions/WebUiActionContext';
import { NavigateAction } from '@plugins/web-ui/actions/Navigate';
import { ClickAction } from '@plugins/web-ui/actions/Click';
import { TypeAction } from '@plugins/web-ui/actions/Type';
import { ReadTextAction } from '@plugins/web-ui/actions/ReadText';
import { WaitForElementAction } from '@plugins/web-ui/actions/WaitForElement';
import { AssertTextAction } from '@plugins/web-ui/actions/AssertText';
import { ScrollToAction } from '@plugins/web-ui/actions/ScrollTo';
import { EvaluateAction } from '@plugins/web-ui/actions/Evaluate';

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
