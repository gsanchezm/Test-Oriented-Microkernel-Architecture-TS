import type { Browser, Page } from 'playwright';
import { ActionContext } from '@plugins/shared/ActionHandler';

export interface WebUiActionContext extends ActionContext<Page> {
    page: Page;
    browser: Browser;
    target: string;
    sessionId: string;
}
