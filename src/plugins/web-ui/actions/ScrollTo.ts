import { ActionHandler } from '@plugins/shared/ActionHandler';
import { WebUiActionContext } from '@plugins/web-ui/actions/WebUiActionContext';

export const ScrollToAction: ActionHandler<WebUiActionContext> = {
    name: 'SCROLL_TO',
    async execute({ page, target }) {
        await page.locator(target).scrollIntoViewIfNeeded();
        return `Scrolled to: ${target}`;
    },
};
