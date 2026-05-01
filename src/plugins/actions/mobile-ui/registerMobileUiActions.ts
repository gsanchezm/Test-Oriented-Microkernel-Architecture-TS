import { ActionRegistry } from '@plugins/actions/ActionRegistry';
import { MobileUiActionContext } from '@plugins/actions/mobile-ui/MobileUiActionContext';
import { NavigateAction } from '@plugins/actions/mobile-ui/Navigate';
import { DeepLinkAction } from '@plugins/actions/mobile-ui/DeepLink';
import { SwitchContextAction } from '@plugins/actions/mobile-ui/SwitchContext';
import { HideKeyboardAction } from '@plugins/actions/mobile-ui/HideKeyboard';
import { ClickAction } from '@plugins/actions/mobile-ui/Click';
import { TypeAction } from '@plugins/actions/mobile-ui/Type';
import { ReadTextAction } from '@plugins/actions/mobile-ui/ReadText';
import { WaitForElementAction } from '@plugins/actions/mobile-ui/WaitForElement';
import { AssertTextAction } from '@plugins/actions/mobile-ui/AssertText';
import { ScrollToAction } from '@plugins/actions/mobile-ui/ScrollTo';
import { EvaluateAction } from '@plugins/actions/mobile-ui/Evaluate';

let cachedRegistry: ActionRegistry<MobileUiActionContext> | null = null;

export function getMobileUiActionRegistry(): ActionRegistry<MobileUiActionContext> {
    if (cachedRegistry) return cachedRegistry;

    const registry = new ActionRegistry<MobileUiActionContext>({ plugin: 'mobile-ui' });
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
