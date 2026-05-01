import type { Browser, Page } from 'playwright';
import { ActionContext } from '@plugins/actions/ActionHandler';

export interface WebUiActionContext extends ActionContext<Page> {
    page: Page;
    browser: Browser;
    target: string;
    sessionId: string;
}
