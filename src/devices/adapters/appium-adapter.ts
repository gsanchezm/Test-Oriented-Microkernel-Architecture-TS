// Appium adapter — translates a driver-agnostic DevicePassport into a
// W3C-style capabilities object that Appium / WebdriverIO consume.
//
// Convention: passport.appium fields are merged in WITHOUT the `appium:`
// prefix; this adapter adds the prefix while building the final cap set.
// Top-level fields become `platformName`/`appium:platformVersion`/etc.

import { resolve, isAbsolute } from 'path';
import { existsSync } from 'fs';
import { logger } from '@utils/logger';
import { DevicePassport } from '@devices/device-passport.types';

const REPO_ROOT = resolve(__dirname, '../../..');

export interface AppiumCapsOptions {
    /** Cucumber worker id. Used to derive per-worker `wdaLocalPort` for parallel iOS sessions. */
    sessionId?: string;
    /** Override UDID at runtime (e.g. when DEVICE_PROFILES selects a profile but the actual device is picked from env). */
    udidOverride?: string;
    /** Override binary path at runtime (e.g. ANDROID_APP_PATH / IOS_APP_PATH from env). */
    binaryPathOverride?: string;
}

const APPIUM_PREFIX = 'appium:';

function withPrefix(key: string): string {
    return key.startsWith(APPIUM_PREFIX) || key === 'platformName' ? key : `${APPIUM_PREFIX}${key}`;
}

function resolveBinaryPath(rel: string | undefined, override: string | undefined): string | undefined {
    const value = override ?? rel;
    if (!value) return undefined;
    const abs = isAbsolute(value) ? value : resolve(REPO_ROOT, value);
    if (!existsSync(abs)) {
        logger.warn({ path: abs }, '[appium-adapter] App binary not found — Appium may fail to install.');
    }
    return abs;
}

/** Build a W3C capabilities object from a passport. Pure — no side effects. */
export function toAppiumCapabilities(
    passport: DevicePassport,
    options: AppiumCapsOptions = {},
): Record<string, unknown> {
    const caps: Record<string, unknown> = {
        platformName: passport.platform === 'android' ? 'Android' : 'iOS',
    };

    if (passport.osVersion) caps['appium:platformVersion'] = passport.osVersion;
    if (passport.model) caps['appium:deviceName'] = passport.model;

    const udid = options.udidOverride ?? passport.udid ?? undefined;
    if (udid) caps['appium:udid'] = udid;

    // App binding — Android uses package + (optionally) APK path; iOS uses bundleId + (optionally) .app path.
    if (passport.platform === 'android') {
        if (passport.app?.package) caps['appium:appPackage'] = passport.app.package;
        if (passport.app?.waitActivity) caps['appium:appWaitActivity'] = passport.app.waitActivity;
    } else {
        if (passport.app?.bundleId) caps['appium:bundleId'] = passport.app.bundleId;
    }
    const binary = resolveBinaryPath(passport.app?.binaryPath, options.binaryPathOverride);
    if (binary) caps['appium:app'] = binary;

    // Free-form Appium overrides — added with prefix.
    for (const [key, value] of Object.entries(passport.appium ?? {})) {
        caps[withPrefix(key)] = value;
    }

    // Per-worker WDA port for iOS to avoid collisions in parallel runs.
    const sessionId = options.sessionId ?? '0';
    if (passport.platform === 'ios' && sessionId !== '0') {
        const base = parseInt(String(caps['appium:wdaLocalPort'] ?? '8101'), 10);
        caps['appium:wdaLocalPort'] = base + parseInt(sessionId, 10);
    }

    return caps;
}

export const AppiumAdapter = { toAppiumCapabilities };
