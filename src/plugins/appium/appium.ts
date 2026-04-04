import { remote, Browser } from 'webdriverio';
import { logger } from '../../utils/logger';

// --- Types ---

type ActionHandler = (driver: Browser, target: string) => Promise<string>;

// --- Configuration ---

const ACTION_TYPE_SEPARATOR = '||';

const PLATFORM = (process.env.PLATFORM || 'android').toLowerCase();

const androidCapabilities = {
    platformName: 'Android',
    'appium:automationName': 'UiAutomator2',
    'appium:app': process.env.ANDROID_APP_PATH || '/app/builds/demo.apk',
    'appium:noReset': false,
    'appium:fullReset': false,
};

const iosCapabilities = {
    platformName: 'iOS',
    'appium:automationName': 'XCUITest',
    'appium:app': process.env.IOS_APP_PATH || '/app/builds/OmniPizza.zip',
    'appium:noReset': false,
    'appium:fullReset': false,
    'appium:udid': process.env.IOS_UDID || 'auto',
};

const capabilities = PLATFORM === 'ios' ? iosCapabilities : androidCapabilities;

const wdioOptions = {
    hostname: process.env.APPIUM_HOST || '127.0.0.1',
    port: parseInt(process.env.APPIUM_PORT || '4723', 10),
    logLevel: 'error' as const,
    capabilities,
};

// --- Session Map (mirrors Playwright pattern for parallel isolation) ---

const sessions: Map<string, Browser> = new Map();

async function ensureSession(sessionId: string): Promise<Browser> {
    if (sessions.has(sessionId)) return sessions.get(sessionId)!;

    logger.info(`[Appium] Bootstrapping ${PLATFORM === 'ios' ? 'XCUITest' : 'UiAutomator2'} session "${sessionId}"...`);
    const driver = await remote(wdioOptions);
    sessions.set(sessionId, driver);
    logger.info(`[Appium] Session "${sessionId}" created (total active: ${sessions.size})`);
    return driver;
}

// --- Teardown Helper ---

async function teardown(sessionId: string): Promise<void> {
    const driver = sessions.get(sessionId);
    if (driver) {
        await driver.deleteSession();
        sessions.delete(sessionId);
        logger.info(`[Appium] Session "${sessionId}" closed (remaining: ${sessions.size})`);
    }
}

// --- Intent → Handler Map ---

const actionHandlers: ReadonlyMap<string, ActionHandler> = new Map([
    [
        'NAVIGATE',
        async (_driver, url) => {
            // On mobile, NAVIGATE translates to a deep link to bypass UI navigation
            await _driver.url(url);
            return `Deep-linked successfully to ${url}`;
        },
    ],
    [
        'CLICK',
        async (_driver, selector) => {
            const target = await _driver.$(selector);
            await target.click();
            return `Tapped on mobile element: ${selector}`;
        },
    ],
    [
        'TYPE',
        async (_driver, composite) => {
            const sepIndex = composite.indexOf(ACTION_TYPE_SEPARATOR);

            if (sepIndex === -1) {
                throw new Error("TYPE action requires 'selector||text' format.");
            }

            const selector = composite.slice(0, sepIndex);
            const text = composite.slice(sepIndex + ACTION_TYPE_SEPARATOR.length);

            if (!text) {
                throw new Error("TYPE action requires non-empty text after 'selector||'.");
            }

            const target = await _driver.$(selector);
            await target.setValue(text);
            return `Typed text into mobile element: ${selector}`;
        },
    ],
    [
        'READ_TEXT',
        async (_driver, selector) => {
            const elements = await _driver.$$(selector);
            const texts = await Promise.all(elements.map((el) => el.getText()));
            return texts.join('\n');
        },
    ],
    [
        'EVALUATE',
        async (_driver, script) => {
            // Works for WebView contexts; for native apps this executes mobile: shell or
            // Appium's execute() bridge depending on the automation context.
            const result = await _driver.execute(script);
            return result !== undefined ? String(result) : '';
        },
    ],
    [
        'TEARDOWN',
        async () => {
            // sessionId is handled in execute() before calling the handler
            return 'Appium execution environment terminated securely.';
        },
    ],
]);

// --- Public API ---

export async function execute(
    actionId: string,
    targetSelector: string,
    sessionId: string = '0',
): Promise<string> {
    const normalizedAction = actionId.toUpperCase();
    const handler = actionHandlers.get(normalizedAction);

    if (!handler) {
        throw new Error(`Unsupported Appium actionId: ${actionId}`);
    }

    // TEARDOWN is session-scoped — skip ensureSession to avoid booting a driver just to close it
    if (normalizedAction === 'TEARDOWN') {
        await teardown(sessionId);
        return 'Appium execution environment terminated securely.';
    }

    const driver = await ensureSession(sessionId);
    return handler(driver, targetSelector);
}
