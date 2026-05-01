import { ActionHandler } from '@plugins/actions/ActionHandler';
import { WebUiActionContext } from '@plugins/actions/web-ui/WebUiActionContext';

export const ScrollToAction: ActionHandler<WebUiActionContext> = {
    name: 'SCROLL_TO',
    async execute({ page, target }) {
        await page.locator(target).scrollIntoViewIfNeeded();
        return `Scrolled to: ${target}`;
    },
};
