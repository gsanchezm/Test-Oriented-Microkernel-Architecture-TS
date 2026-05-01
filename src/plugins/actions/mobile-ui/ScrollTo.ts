import { ActionHandler } from '@plugins/actions/ActionHandler';
import { MobileUiActionContext } from '@plugins/actions/mobile-ui/MobileUiActionContext';

export const ScrollToAction: ActionHandler<MobileUiActionContext> = {
    name: 'SCROLL_TO',
    async execute({ driver, target }) {
        await driver.$(target).scrollIntoView();
        return `Scrolled to: ${target}`;
    },
};
