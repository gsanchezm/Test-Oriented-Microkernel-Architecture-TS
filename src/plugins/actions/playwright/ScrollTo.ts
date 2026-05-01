import { ActionHandler } from '@plugins/actions/ActionHandler';
import { PlaywrightActionContext } from '@plugins/actions/playwright/PlaywrightActionContext';

export const ScrollToAction: ActionHandler<PlaywrightActionContext> = {
    name: 'SCROLL_TO',
    async execute({ page, target }) {
        await page.locator(target).scrollIntoViewIfNeeded();
        return `Scrolled to: ${target}`;
    },
};
