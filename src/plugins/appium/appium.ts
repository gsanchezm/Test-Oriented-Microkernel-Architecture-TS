import { remote, Browser } from 'webdriverio';
import { logger } from '../../utils/logger';
import * as fs from 'fs';
import * as path from 'path';

// --- Types ---

type ActionHandler = (driver: Browser, target: string) => Promise<string>;

// --- Capability Profile Loader ---

const PLATFORM = (process.env.PLATFORM || 'android').toLowerCase();
const CAP_PROFILE = process.env.CAP_PROFILE;

function listProfiles(): string {
    const dir = path.resolve(__dirname, 'capabilities', PLATFORM);
    if (!fs.existsSync(dir)) return '(no profiles directory found)';
    return fs.readdirSync(dir)
        .filter((f) => f.endsWith('.json'))
        .map((f) => f.replace('.json', ''))
        .join(', ') || '(empty)';
}

function resolveAppPath(envVar: string | undefined): string | undefined {
    if (!envVar) return undefined;
    // Resolve relative paths to absolute so Appium can locate the app file
    const resolved = path.isAbsolute(envVar) ? envVar : path.resolve(process.cwd(), envVar);
    if (!fs.existsSync(resolved)) {
        logger.warn({ path: resolved }, '[Appium] App file not found — check ANDROID_APP_PATH / IOS_APP_PATH');
    }
    return resolved;
}

function resolveUdid(sessionId: string): string | undefined {
    // Per-worker UDID: IOS_UDID_0, IOS_UDID_1, … (for parallel simulators/devices)
    const perWorker = process.env[`${PLATFORM.toUpperCase()}_UDID_${sessionId}`];
    if (perWorker) return perWorker;

    // Single UDID: IOS_UDID or ANDROID_UDID
    const single = process.env[`${PLATFORM.toUpperCase()}_UDID`];
    if (single) return single;

    // Not set — Appium will auto-select an available simulator/device
    return undefined;
}

function loadCapabilities(sessionId: string = '0'): Record<string, unknown> {
    if (!CAP_PROFILE) {
        throw new Error(
            '[Appium] CAP_PROFILE env var is required. ' +
            `Example: CAP_PROFILE=galaxy_s25_ultra for capabilities/${PLATFORM}/galaxy_s25_ultra.json`,
        );
    }

    const capPath = path.resolve(
        __dirname,
        'capabilities',
        PLATFORM,
        `${CAP_PROFILE}.json`,
    );

    if (!fs.existsSync(capPath)) {
        throw new Error(
            `[Appium] Capability profile not found: ${capPath}\n` +
            `Available profiles: ${listProfiles()}`,
        );
    }

    const caps = JSON.parse(fs.readFileSync(capPath, 'utf-8')) as Record<string, unknown>;

    // App path — env var overrides JSON (required for CI/Docker); resolved to absolute path
    if (PLATFORM === 'android') {
        const appPath = resolveAppPath(process.env.ANDROID_APP_PATH);
        if (appPath) caps['appium:app'] = appPath;
    }
    if (PLATFORM === 'ios') {
        const appPath = resolveAppPath(process.env.IOS_APP_PATH);
        if (appPath) caps['appium:app'] = appPath;
    }

    // UDID — resolved per session to support parallel devices
    const udid = resolveUdid(sessionId);
    if (udid) caps['appium:udid'] = udid;

    // iOS WDA port must be unique per parallel worker to avoid port conflicts
    if (PLATFORM === 'ios' && sessionId !== '0') {
        const basePort = parseInt(String(caps['appium:wdaLocalPort'] ?? '8101'), 10);
        caps['appium:wdaLocalPort'] = basePort + parseInt(sessionId, 10);
    }

    logger.info({ profile: CAP_PROFILE, platform: PLATFORM, sessionId, udid: udid ?? 'auto' }, '[Appium] Capabilities loaded');
    return caps;
}

// --- Configuration ---

const ACTION_TYPE_SEPARATOR = '||';

const APPIUM_HOST = process.env.APPIUM_HOST || '127.0.0.1';
const APPIUM_PORT = parseInt(process.env.APPIUM_PORT || '4723', 10);

// --- Session Map (mirrors Playwright pattern for parallel isolation) ---

const sessions: Map<string, Browser> = new Map();

async function ensureSession(sessionId: string): Promise<Browser> {
    if (sessions.has(sessionId)) return sessions.get(sessionId)!;

    // Capabilities are resolved per session so each worker gets its own UDID / WDA port
    const capabilities = loadCapabilities(sessionId);
    const wdioOptions = {
        hostname: APPIUM_HOST,
        port: APPIUM_PORT,
        logLevel: 'error' as const,
        capabilities,
    };

    logger.info({ sessionId, platform: PLATFORM }, '[Appium] Bootstrapping session...');
    const driver = await remote(wdioOptions);
    sessions.set(sessionId, driver);
    logger.info({ sessionId, total: sessions.size }, '[Appium] Session created');
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
            await _driver.url(url);
            return `Navigated to ${url}`;
        },
    ],
    [
        'SWITCH_CONTEXT',
        async (_driver, contextName) => {
            const contexts = await _driver.getContexts() as string[];
            if (contextName === 'WEBVIEW') {
                const webview = contexts.find((c) => c.startsWith('WEBVIEW_'));
                if (!webview) {
                    throw new Error(`No WebView context found. Available: ${contexts.join(', ')}`);
                }
                await _driver.switchContext(webview);
                return `Switched to context: ${webview}`;
            }
            // NATIVE or explicit context name
            const target = contextName === 'NATIVE' ? 'NATIVE_APP' : contextName;
            await _driver.switchContext(target);
            return `Switched to context: ${target}`;
        },
    ],
    [
        'CLICK',
        async (_driver, selector) => {
            const target = _driver.$(selector);
            await (target.click() as Promise<void>);
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

            const target = _driver.$(selector);
            await (target.setValue(text) as Promise<void>);
            return `Typed text into mobile element: ${selector}`;
        },
    ],
    [
        'READ_TEXT',
        async (_driver, selector) => {
            const elements = _driver.$$(selector);
            const texts: string[] = [];
            for (const el of await elements.getElements()) {
                texts.push(await el.getText());
            }
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
