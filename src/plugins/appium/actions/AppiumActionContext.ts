import type { Browser } from 'webdriverio';
import {
    ActionInvocationContext,
    DriverContext,
    MetadataContext,
    PlatformContext,
} from '@plugins/shared/ActionHandler';
import type { AppiumHelpers } from '@plugins/appium/appium-helpers';

export interface AppiumActionContext
    extends ActionInvocationContext, DriverContext<Browser>, PlatformContext, MetadataContext {
    helpers: AppiumHelpers;
}
