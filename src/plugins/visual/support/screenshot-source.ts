// Vendor-neutral screenshot source contract. The Visual oracle composes
// over this interface and never imports Playwright or WebdriverIO directly.
//
// resolvedRegionSelector is the platform-specific selector already
// produced by the existing locator-resolver — sources should use it as
// a hint (e.g. element.screenshot()) but must still return *some* PNG
// even when the selector cannot be located, so that the comparison
// step produces a clear failure rather than a silent skip.

export interface ScreenshotCaptureOptions {
    platform: string;
    viewport?: string;
    sessionId?: string;
    regionSelector?: string;     // resolved selector for the snapshot region
    maskSelectors?: string[];    // resolved selectors for masked regions
    metadata?: Record<string, unknown>;
}

export interface ScreenshotSource {
    capture(options: ScreenshotCaptureOptions): Promise<Buffer>;
}
