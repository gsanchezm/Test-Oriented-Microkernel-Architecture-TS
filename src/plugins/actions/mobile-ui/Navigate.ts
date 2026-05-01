import { ActionHandler } from '@plugins/actions/ActionHandler';
import { MobileUiActionContext } from '@plugins/actions/mobile-ui/MobileUiActionContext';

export const NavigateAction: ActionHandler<MobileUiActionContext> = {
    name: 'NAVIGATE',
    async execute({ driver, target }) {
        await driver.url(target);
        return `Navigated to ${target}`;
    },
};
