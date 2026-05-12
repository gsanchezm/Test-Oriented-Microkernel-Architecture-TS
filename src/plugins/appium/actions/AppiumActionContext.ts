import type { Browser } from 'webdriverio';
import { ActionContext } from '@plugins/shared/ActionHandler';
import type { AppiumHelpers } from '@plugins/appium/appium-helpers';

export interface AppiumActionContext extends ActionContext<Browser> {
    driver: Browser;
    target: string;
    sessionId: string;
    platform: string;
    helpers: AppiumHelpers;
}
