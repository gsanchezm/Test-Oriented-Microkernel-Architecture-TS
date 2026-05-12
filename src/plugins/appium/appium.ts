import { remote, Browser } from 'webdriverio';
import { logger } from '@utils/logger';
import { getAppiumActionRegistry } from '@plugins/appium/actions/registerAppiumActions';
import {
    PLATFORM,
    appiumHelpers,
    dismissAndroidSystemDialog,
    setCachedAppId,
} from '@plugins/appium/appium-helpers';
import { DeviceLoader } from '@devices/device-loader';
import { AppiumAdapter } from '@devices/adapters/appium-adapter';

// --- Capability Profile Loader (delegates to driver-agnostic device passport) ---

function resolveUdidOverride(passportPlatform: 'android' | 'ios', sessionId: string): string | undefined {
    // Per-worker UDID: ANDROID_UDID_0/IOS_UDID_0/… for parallel simulators/devices.
    const perWorker = process.env[`${passportPlatform.toUpperCase()}_UDID_${sessionId}`];
    if (perWorker) return perWorker;
    const single = process.env[`${passportPlatform.toUpperCase()}_UDID`];
    if (single) return single;
    return undefined;
}

function resolveBinaryPathOverride(passportPlatform: 'android' | 'ios'): string | undefined {
    return passportPlatform === 'android'
        ? process.env.ANDROID_APP_PATH
        : process.env.IOS_APP_PATH;
}

function loadCapabilities(sessionId: string = '0'): Record<string, unknown> {
    const passport = DeviceLoader.forWorker(sessionId);

    if (passport.platform !== PLATFORM) {
        // PLATFORM env decides registry lookups (helpers, screenshot source);
        // mismatch with the passport platform would silently target the wrong driver.
        throw new Error(
            `[Appium] PLATFORM='${PLATFORM}' but passport '${passport.id}' is platform='${passport.platform}'. ` +
            `Set PLATFORM=${passport.platform} or pick a different DEVICE_PROFILE.`,
        );
    }

    const caps = AppiumAdapter.toAppiumCapabilities(passport, {
        sessionId,
        udidOverride: resolveUdidOverride(passport.platform, sessionId),
        binaryPathOverride: resolveBinaryPathOverride(passport.platform),
    });

    const deviceName = process.env[`${PLATFORM.toUpperCase()}_DEVICE_NAME`];
    if (deviceName) caps['appium:deviceName'] = deviceName;

    // Cache app identifier for DEEP_LINK (read once from caps at session creation time)
    if (PLATFORM === 'android') setCachedAppId(caps['appium:appPackage'] as string | undefined);
    if (PLATFORM === 'ios') setCachedAppId(caps['appium:bundleId'] as string | undefined);

    logger.info(
        { profile: passport.id, platform: PLATFORM, sessionId, udid: caps['appium:udid'] ?? 'auto' },
        '[Appium] Capabilities loaded',
    );
    return caps;
}

// --- Configuration ---

const APPIUM_HOST = process.env.APPIUM_HOST || '127.0.0.1';
const APPIUM_PORT = parseInt(process.env.APPIUM_PORT || '4723', 10);

// --- Session Map (mirrors Playwright pattern for parallel isolation) ---

const sessions: Map<string, Browser> = new Map();

async function ensureSession(sessionId: string): Promise<Browser> {
    if (sessions.has(sessionId)) return sessions.get(sessionId)!;

    const capabilities = loadCapabilities(sessionId);
    const wdioOptions = {
        hostname: APPIUM_HOST,
        port: APPIUM_PORT,
        logLevel: 'error' as const,
        // First-run bootstrap on a fresh simulator can take several minutes:
        // WDA xcodebuild + app install + WDA launch. Match the server-side
        // wdaLaunchTimeout (4 min) with headroom for the app install step.
        connectionRetryTimeout: 360000,
        connectionRetryCount: 0,
        capabilities,
    };

    logger.info({ sessionId, platform: PLATFORM }, '[Appium] Bootstrapping session...');
    const driver = await remote(wdioOptions);
    sessions.set(sessionId, driver);
    logger.info({ sessionId, total: sessions.size }, '[Appium] Session created');
    return driver;
}

async function teardown(sessionId: string): Promise<void> {
    const driver = sessions.get(sessionId);
    if (driver) {
        await driver.deleteSession();
        sessions.delete(sessionId);
        logger.info(`[Appium] Session "${sessionId}" closed (remaining: ${sessions.size})`);
    }
}

// --- Read-only session accessors ---
//
// Used by the Visual plugin to capture screenshots from the *existing*
// active driver without booting a new Appium session. Throws when no
// session is active.

export function getActiveDriver(sessionId: string = '0'): Browser {
    const driver = sessions.get(sessionId);
    if (!driver) {
        throw new Error(
            `[Appium] No active session for sessionId='${sessionId}'. ` +
            `Visual oracle must run after a UI action that creates the session.`,
        );
    }
    return driver;
}

export function hasActiveDriver(sessionId: string = '0'): boolean {
    return sessions.has(sessionId);
}

// --- Public API ---

export async function teardownAllSessions(): Promise<void> {
    const ids = [...sessions.keys()];
    await Promise.all(ids.map(teardown));
    logger.info('[Appium] All sessions closed');
}

const registry = getAppiumActionRegistry();

export async function execute(
    actionId: string,
    targetSelector: string,
    sessionId: string = '0',
): Promise<string> {
    const normalizedAction = actionId.toUpperCase();

    // TEARDOWN is session-scoped — never boot a driver just to close it.
    if (normalizedAction === 'TEARDOWN') {
        await teardown(sessionId);
        return 'Appium execution environment terminated securely.';
    }

    const driver = await ensureSession(sessionId);
    await dismissAndroidSystemDialog(driver);

    const result = await registry.execute(normalizedAction, {
        driver,
        target: targetSelector,
        actionId: normalizedAction,
        sessionId,
        platform: PLATFORM,
        helpers: appiumHelpers,
        metadata: { plugin: 'appium' },
    });

    await dismissAndroidSystemDialog(driver);
    return result;
}
