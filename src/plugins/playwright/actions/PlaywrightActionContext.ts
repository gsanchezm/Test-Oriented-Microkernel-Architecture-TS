import type { Browser, Page } from 'playwright';
import {
    ActionInvocationContext,
    DriverContext,
    MetadataContext,
    PlatformContext,
    ViewportContext,
} from '@plugins/shared/ActionHandler';

export interface PlaywrightActionContext
    extends ActionInvocationContext, DriverContext<Page>, PlatformContext, ViewportContext, MetadataContext {
    page: Page;
    browser: Browser;
}
