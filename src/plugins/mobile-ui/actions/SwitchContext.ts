import { ActionHandler } from '@plugins/shared/ActionHandler';
import { MobileUiActionContext } from '@plugins/mobile-ui/actions/MobileUiActionContext';

export const SwitchContextAction: ActionHandler<MobileUiActionContext> = {
    name: 'SWITCH_CONTEXT',
    async execute({ driver, target }) {
        const contexts = await driver.getContexts() as string[];
        if (target === 'WEBVIEW') {
            const webview = contexts.find((c) => c.startsWith('WEBVIEW_'));
            if (!webview) {
                throw new Error(`No WebView context found. Available: ${contexts.join(', ')}`);
            }
            await driver.switchContext(webview);
            return `Switched to context: ${webview}`;
        }
        const dest = target === 'NATIVE' ? 'NATIVE_APP' : target;
        await driver.switchContext(dest);
        return `Switched to context: ${dest}`;
    },
};
