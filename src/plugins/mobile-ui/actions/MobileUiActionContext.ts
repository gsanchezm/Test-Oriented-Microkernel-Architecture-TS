import type { Browser } from 'webdriverio';
import { ActionContext } from '@plugins/shared/ActionHandler';
import type { AppiumHelpers } from '@plugins/mobile-ui/appium-helpers';

export interface MobileUiActionContext extends ActionContext<Browser> {
    driver: Browser;
    target: string;
    sessionId: string;
    platform: string;
    helpers: AppiumHelpers;
}
