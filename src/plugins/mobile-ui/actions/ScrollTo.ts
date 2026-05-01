import { ActionHandler } from '@plugins/shared/ActionHandler';
import { MobileUiActionContext } from '@plugins/mobile-ui/actions/MobileUiActionContext';

export const ScrollToAction: ActionHandler<MobileUiActionContext> = {
    name: 'SCROLL_TO',
    async execute({ driver, target }) {
        await driver.$(target).scrollIntoView();
        return `Scrolled to: ${target}`;
    },
};
