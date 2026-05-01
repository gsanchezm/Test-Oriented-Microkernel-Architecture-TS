import { ActionRegistry } from '@plugins/actions/ActionRegistry';
import { AppiumActionContext } from '@plugins/actions/appium/AppiumActionContext';
import { NavigateAction } from '@plugins/actions/appium/Navigate';
import { DeepLinkAction } from '@plugins/actions/appium/DeepLink';
import { SwitchContextAction } from '@plugins/actions/appium/SwitchContext';
import { HideKeyboardAction } from '@plugins/actions/appium/HideKeyboard';
import { ClickAction } from '@plugins/actions/appium/Click';
import { TypeAction } from '@plugins/actions/appium/Type';
import { ReadTextAction } from '@plugins/actions/appium/ReadText';
import { WaitForElementAction } from '@plugins/actions/appium/WaitForElement';
import { AssertTextAction } from '@plugins/actions/appium/AssertText';
import { ScrollToAction } from '@plugins/actions/appium/ScrollTo';
import { EvaluateAction } from '@plugins/actions/appium/Evaluate';

let cachedRegistry: ActionRegistry<AppiumActionContext> | null = null;

export function getAppiumActionRegistry(): ActionRegistry<AppiumActionContext> {
    if (cachedRegistry) return cachedRegistry;

    const registry = new ActionRegistry<AppiumActionContext>({ plugin: 'appium' });
    registry
        .register(NavigateAction)
        .register(DeepLinkAction)
        .register(SwitchContextAction)
        .register(HideKeyboardAction)
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

export function resetAppiumActionRegistry(): void {
    cachedRegistry = null;
}
