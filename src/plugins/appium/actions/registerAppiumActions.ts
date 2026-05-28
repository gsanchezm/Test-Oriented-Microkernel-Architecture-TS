import { ActionRegistry } from '@plugins/shared/ActionRegistry';
import { AppiumActionContext } from '@plugins/appium/actions/AppiumActionContext';
import { NavigateAction } from '@plugins/appium/actions/Navigate';
import { DeepLinkAction } from '@plugins/appium/actions/DeepLink';
import { SwitchContextAction } from '@plugins/appium/actions/SwitchContext';
import { HideKeyboardAction } from '@plugins/appium/actions/HideKeyboard';
import { ClickAction } from '@plugins/appium/actions/Click';
import { TypeAction } from '@plugins/appium/actions/Type';
import { ClearTextAction } from '@plugins/appium/actions/ClearText';
import { ReadTextAction } from '@plugins/appium/actions/ReadText';
import { WaitForElementAction } from '@plugins/appium/actions/WaitForElement';
import { AssertTextAction } from '@plugins/appium/actions/AssertText';
import { ScrollToAction } from '@plugins/appium/actions/ScrollTo';
import { EvaluateAction } from '@plugins/appium/actions/Evaluate';
import { ScreenshotAction } from '@plugins/appium/actions/Screenshot';

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
        .register(ClearTextAction)
        .register(ReadTextAction)
        .register(WaitForElementAction)
        .register(AssertTextAction)
        .register(ScrollToAction)
        .register(EvaluateAction)
        .register(ScreenshotAction);

    cachedRegistry = registry;
    return registry;
}

export function resetAppiumActionRegistry(): void {
    cachedRegistry = null;
}
