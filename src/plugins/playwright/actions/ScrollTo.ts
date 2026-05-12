import { ActionHandler } from '@plugins/shared/ActionHandler';
import { PlaywrightActionContext } from '@plugins/playwright/actions/PlaywrightActionContext';

export const ScrollToAction: ActionHandler<PlaywrightActionContext> = {
    name: 'SCROLL_TO',
    async execute({ page, target }) {
        await page.locator(target).scrollIntoViewIfNeeded();
        return `Scrolled to: ${target}`;
    },
};
