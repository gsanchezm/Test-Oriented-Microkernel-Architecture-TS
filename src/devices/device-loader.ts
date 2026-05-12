// DeviceLoader — single entrypoint for resolving a DevicePassport.
//
// Resolution precedence (highest first):
//   1. Explicit id passed to loadById().
//   2. DEVICE_PROFILES env var, indexed by worker id (per-worker binding for
//      cucumber `parallel` runs). Format: "huawei_y9,pixel_8a,iphone_15".
//   3. DEVICE_PROFILE env var (single-device runs).
//   4. CAP_PROFILE env var (legacy fallback — same id space).
//
// Reads <repo-root>/src/devices/<id>.json once per id and memoizes.

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { DevicePassport, DevicePlatform, CompatibleDriver } from '@devices/device-passport.types';

const REPO_ROOT = resolve(__dirname, '../..');
const DEVICES_DIR = resolve(REPO_ROOT, 'src/devices');
const cache = new Map<string, DevicePassport>();

function fail(msg: string): never {
    throw new Error(`[device-loader] ${msg}`);
}

function validate(raw: unknown, id: string): DevicePassport {
    if (!raw || typeof raw !== 'object') fail(`'${id}' is not a JSON object`);
    const p = raw as Partial<DevicePassport>;
    if (typeof p.id !== 'string' || p.id !== id) {
        fail(`'${id}' has mismatched 'id' field (got ${JSON.stringify(p.id)})`);
    }
    if (p.platform !== 'android' && p.platform !== 'ios') {
        fail(`'${id}' has invalid platform '${String(p.platform)}'`);
    }
    return p as DevicePassport;
}

export function loadById(id: string): DevicePassport {
    const cached = cache.get(id);
    if (cached) return cached;

    const path = resolve(DEVICES_DIR, `${id}.json`);
    if (!existsSync(path)) {
        fail(`profile '${id}' not found at ${path}`);
    }
    const passport = validate(JSON.parse(readFileSync(path, 'utf-8')), id);
    cache.set(id, passport);
    return passport;
}

function resolveIdForWorker(workerId: string): string {
    const list = process.env.DEVICE_PROFILES?.split(',').map((s) => s.trim()).filter(Boolean);
    if (list && list.length > 0) {
        const idx = parseInt(workerId, 10);
        const picked = list[Number.isFinite(idx) ? idx % list.length : 0];
        if (picked) return picked;
    }

    const single = process.env.DEVICE_PROFILE ?? process.env.CAP_PROFILE;
    if (single && single.length > 0) return single;

    fail(
        `no device profile resolvable. Set DEVICE_PROFILE=<id>, ` +
        `DEVICE_PROFILES=<id1,id2,...>, or CAP_PROFILE=<id>.`,
    );
}

function currentDriver(): CompatibleDriver | undefined {
    const raw = process.env.DRIVER?.toLowerCase();
    if (!raw) return undefined;
    if (raw === 'playwright' || raw === 'appium' || raw === 'mobilewright' || raw === 'api') {
        return raw;
    }
    return undefined;
}

/** Throws a clear error when DRIVER is not in passport.compatibleDrivers. */
export function assertDriverCompatibility(passport: DevicePassport, driver?: CompatibleDriver): void {
    const wanted = driver ?? currentDriver();
    if (!wanted || !passport.compatibleDrivers || passport.compatibleDrivers.length === 0) return;
    if (!passport.compatibleDrivers.includes(wanted)) {
        fail(
            `device '${passport.id}' (${passport.platform} ${passport.osVersion ?? '?'}) ` +
            `is not compatible with DRIVER='${wanted}'. ` +
            `Compatible drivers: ${passport.compatibleDrivers.join(', ')}.`,
        );
    }
}

/** Resolve the passport for a given cucumber worker session. */
export function forWorker(workerId: string = '0'): DevicePassport {
    const passport = loadById(resolveIdForWorker(workerId));
    assertDriverCompatibility(passport);
    return passport;
}

/** Convenience for the default worker — used when only one device is in play. */
export function current(): DevicePassport {
    return forWorker('0');
}

/** Read-only — exported so tests can clear the cache between fixtures. */
export function _resetCacheForTests(): void {
    cache.clear();
}

export const DeviceLoader = {
    loadById,
    forWorker,
    current,
    assertDriverCompatibility,
    _resetCacheForTests,
};

export type { DevicePassport, DevicePlatform };
