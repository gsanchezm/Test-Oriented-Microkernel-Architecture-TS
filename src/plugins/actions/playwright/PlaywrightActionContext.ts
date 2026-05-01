import type { Browser, Page } from 'playwright';
import { ActionContext } from '@plugins/actions/ActionHandler';

export interface PlaywrightActionContext extends ActionContext<Page> {
    page: Page;
    browser: Browser;
    target: string;
    sessionId: string;
}
