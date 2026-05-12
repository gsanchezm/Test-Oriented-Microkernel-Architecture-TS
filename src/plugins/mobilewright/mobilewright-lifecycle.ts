// Mobilewright session lifecycle. Mirrors the structure of
// `mobile-ui/appium-lifecycle.ts` but delegates to the `mobilewright`
// npm package (Playwright-inspired mobile automation).
//
// The mobilewright package is ESM-only. Our codebase compiles to
// CommonJS, so a static `import` would fail at runtime. The
// `dynamicImport` Function trick prevents TypeScript from rewriting the
// `import()` into `require()`, which is what bridges CJS → ESM.

import type { Device } from 'mobilewright';
import { logger } from '@utils/logger';
import { DeviceLoader } from '@devices/device-loader';
import { MobilewrightAdapter } from '@devices/adapters/mobilewright-adapter';
import type { DevicePlatform } from '@devices/device-passport.types';

export type MobilewrightPlatform = DevicePlatform;

export interface MobilewrightSession {
    device: Device;
    platform: MobilewrightPlatform;
    profileId: string;
}

const sessions: Map<string, MobilewrightSession> = new Map();

const dynamicImport = new Function('specifier', 'return import(specifier)') as <T = unknown>(
    specifier: string,
) => Promise<T>;

let cachedMobilewright: typeof import('mobilewright') | null = null;

async function loadMobilewright(): Promise<typeof import('mobilewright')> {
    if (cachedMobilewright) return cachedMobilewright;
    try {
        cachedMobilewright = await dynamicImport<typeof import('mobilewright')>('mobilewright');
        return cachedMobilewright;
    } catch (err) {
        throw new Error(
            '[Mobilewright] Failed to load the "mobilewright" package. ' +
            'Run `pnpm install` and confirm the package is in dependencies. ' +
            `Underlying error: ${(err as Error).message}`,
        );
    }
}

function resolveDeviceIdOverride(platform: DevicePlatform, sessionId: string): string | undefined {
    const perWorker = process.env[`${platform.toUpperCase()}_UDID_${sessionId}`];
    if (perWorker) return perWorker;
    const single = process.env[`${platform.toUpperCase()}_UDID`];
    if (single) return single;
    return undefined;
}

function resolveBinaryPathOverride(platform: DevicePlatform): string | undefined {
    return platform === 'android' ? process.env.ANDROID_APP_PATH : process.env.IOS_APP_PATH;
}

export async function ensureSession(sessionId: string = '0'): Promise<MobilewrightSession> {
    const existing = sessions.get(sessionId);
    if (existing) return existing;

    const passport = DeviceLoader.forWorker(sessionId);
    const opts = MobilewrightAdapter.toMobilewrightOptions(passport, {
        deviceIdOverride: resolveDeviceIdOverride(passport.platform, sessionId),
        binaryPathOverride: resolveBinaryPathOverride(passport.platform),
    });

    logger.info(
        { sessionId, platform: passport.platform, profileId: passport.id, deviceId: opts.deviceId ?? 'auto' },
        '[Mobilewright] Bootstrapping session...',
    );

    const mw = await loadMobilewright();
    const launcher = passport.platform === 'ios' ? mw.ios : mw.android;
    const { platform: _omit, ...launchOpts } = opts;
    const device = await launcher.launch(launchOpts);

    const session: MobilewrightSession = { device, platform: passport.platform, profileId: passport.id };
    sessions.set(sessionId, session);
    logger.info({ sessionId, total: sessions.size }, '[Mobilewright] Session created');
    return session;
}

export async function teardown(sessionId: string): Promise<void> {
    const session = sessions.get(sessionId);
    if (!session) return;
    try {
        await session.device.close();
    } catch (err) {
        logger.warn({ sessionId, err: (err as Error).message }, '[Mobilewright] device.close() failed (continuing)');
    }
    sessions.delete(sessionId);
    logger.info(`[Mobilewright] Session "${sessionId}" closed (remaining: ${sessions.size})`);
}

export async function teardownAllSessions(): Promise<void> {
    const ids = [...sessions.keys()];
    await Promise.all(ids.map(teardown));
    logger.info('[Mobilewright] All sessions closed');
}

export function getActiveDevice(sessionId: string = '0'): Device {
    const session = sessions.get(sessionId);
    if (!session) {
        throw new Error(
            `[Mobilewright] No active session for sessionId='${sessionId}'. ` +
            'A UI action must create the session before downstream consumers (e.g. Visual) can read it.',
        );
    }
    return session.device;
}

export function hasActiveDevice(sessionId: string = '0'): boolean {
    return sessions.has(sessionId);
}
