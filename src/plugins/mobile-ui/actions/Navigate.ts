import { ActionHandler } from '@plugins/shared/ActionHandler';
import { MobileUiActionContext } from '@plugins/mobile-ui/actions/MobileUiActionContext';

export const NavigateAction: ActionHandler<MobileUiActionContext> = {
    name: 'NAVIGATE',
    async execute({ driver, target }) {
        await driver.url(target);
        return `Navigated to ${target}`;
    },
};
