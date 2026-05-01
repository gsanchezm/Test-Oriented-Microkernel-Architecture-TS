import { ActionRegistry } from '@plugins/shared/ActionRegistry';
import { MobileUiActionContext } from '@plugins/mobile-ui/actions/MobileUiActionContext';
import { NavigateAction } from '@plugins/mobile-ui/actions/Navigate';
import { DeepLinkAction } from '@plugins/mobile-ui/actions/DeepLink';
import { SwitchContextAction } from '@plugins/mobile-ui/actions/SwitchContext';
import { HideKeyboardAction } from '@plugins/mobile-ui/actions/HideKeyboard';
import { ClickAction } from '@plugins/mobile-ui/actions/Click';
import { TypeAction } from '@plugins/mobile-ui/actions/Type';
import { ReadTextAction } from '@plugins/mobile-ui/actions/ReadText';
import { WaitForElementAction } from '@plugins/mobile-ui/actions/WaitForElement';
import { AssertTextAction } from '@plugins/mobile-ui/actions/AssertText';
import { ScrollToAction } from '@plugins/mobile-ui/actions/ScrollTo';
import { EvaluateAction } from '@plugins/mobile-ui/actions/Evaluate';

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
