import { ActionContext } from '@plugins/shared/ActionHandler';
import { ScreenshotSource } from '@plugins/visual/support/screenshot-source';

export interface VisualActionContext extends ActionContext {
    /**
     * Optional override — when omitted, the handler resolves a source
     * from the snapshot's platform. Tests inject this to fake the
     * underlying Playwright/Appium driver.
     */
    screenshotSource?: ScreenshotSource;
    target: string;
    sessionId: string;
    metadata?: Record<string, unknown>;
}
