// Mobilewright adapter — translates a driver-agnostic DevicePassport
// into the LaunchOptions shape expected by `mobilewright` v0.0.31.
//
// The package is ESM-only ("type": "module"); we expose only types here
// (fully erased at runtime). Runtime imports happen in the lifecycle file
// via dynamic `import()` to bridge the CJS → ESM boundary.

import { resolve, isAbsolute } from 'path';
import type { LaunchOptions, DriverConfig } from 'mobilewright';
import {
    DeviceAppBinding,
    DevicePlatformInfo,
    MobilewrightDeviceConfig,
} from '@devices/device-passport.types';

const REPO_ROOT = resolve(__dirname, '../../..');

export interface MobilewrightLaunchOptions extends LaunchOptions {
    /** Resolved platform — chosen by the lifecycle to pick `ios` vs `android` launcher. */
    platform: 'android' | 'ios';
}

export interface BuildOptions {
    /** Override device id at runtime (e.g. ANDROID_UDID/IOS_UDID env). */
    deviceIdOverride?: string;
    /** Override APK/IPA path at runtime (ANDROID_APP_PATH/IOS_APP_PATH). */
    binaryPathOverride?: string;
}

export interface MobilewrightOptionsPassport
    extends DevicePlatformInfo, DeviceAppBinding, MobilewrightDeviceConfig {
}

function resolveBinaryPath(rel: string | undefined, override: string | undefined): string | undefined {
    const value = override ?? rel;
    if (!value) return undefined;
    return isAbsolute(value) ? value : resolve(REPO_ROOT, value);
}

function pickDriverConfig(passport: MobilewrightOptionsPassport): DriverConfig | undefined {
    const raw = passport.mobilewright?.driver;
    if (!raw) return undefined;
    if (typeof raw === 'string') {
        return raw === 'mobile-use' ? { type: 'mobile-use' } : { type: 'mobilecli' };
    }
    return raw as DriverConfig;
}

/** Build mobilewright LaunchOptions from a passport. Pure — no side effects. */
export function toMobilewrightOptions(
    passport: MobilewrightOptionsPassport,
    options: BuildOptions = {},
): MobilewrightLaunchOptions {
    const deviceId = options.deviceIdOverride ?? passport.udid ?? undefined;
    const binary = resolveBinaryPath(passport.app?.binaryPath, options.binaryPathOverride);
    const bundleId = passport.platform === 'ios' ? passport.app?.bundleId : passport.app?.package;

    const opts: MobilewrightLaunchOptions = {
        platform: passport.platform,
        deviceId,
        bundleId,
        installApps: binary ? [binary] : undefined,
        autoAppLaunch: true,
        autoStart: true,
        ...(passport.mobilewright ?? {}),
    };

    const driver = pickDriverConfig(passport);
    if (driver) opts.driver = driver;

    return opts;
}

export const MobilewrightAdapter = { toMobilewrightOptions };
