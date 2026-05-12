// Driver-agnostic device passport. The same JSON drives both the Appium
// (mobile-ui) plugin and any future mobilewright integration via per-driver
// adapters under src/devices/adapters/.

export type DevicePlatform = 'android' | 'ios';

export interface DeviceScreen {
    width: number;
    height: number;
    /** dpi for Android, scale factor for iOS — informational only. */
    density?: number;
}

export interface DeviceAppInfo {
    /** Android package name. */
    package?: string;
    /** Android primary launch activity (or comma-separated wait set). */
    waitActivity?: string;
    /** iOS bundle identifier. */
    bundleId?: string;
    /** Path to APK / .app bundle, relative to repo root. Used for fresh installs. */
    binaryPath?: string;
}

/** Free-form bag of Appium caps without the `appium:` prefix. The adapter
 * adds the prefix when building the final capabilities object. */
export type AppiumOverrides = Record<string, unknown>;

/** Free-form bag of mobilewright launch options. Schema is owned by the
 * mobilewright adapter; nothing else inspects this. */
export type MobilewrightOverrides = Record<string, unknown>;

/** Drivers the device is known to support. The DeviceLoader validates the
 * runtime DRIVER env against this list and fails fast with a clear error
 * when a device cannot drive a given driver (e.g. mobilewright requires
 * Android 10+, so a SDK 28 device must declare `["appium"]` only). */
export type CompatibleDriver = 'playwright' | 'appium' | 'mobilewright' | 'api';

export interface DevicePassport {
    /** File-name-safe identifier. Must match the JSON filename without `.json`. */
    id: string;
    platform: DevicePlatform;
    /** OS version string. Optional — emulators/simulators may leave it blank. */
    osVersion?: string | null;
    /** ADB serial / iOS UDID. Null when the device is selected via env at runtime. */
    udid?: string | null;
    /** Human-readable model. Informational. */
    model?: string;
    screen?: DeviceScreen | null;
    app?: DeviceAppInfo;
    appium?: AppiumOverrides;
    mobilewright?: MobilewrightOverrides;
    /** Drivers compatible with this device. Omit to allow any driver. */
    compatibleDrivers?: CompatibleDriver[];
}
