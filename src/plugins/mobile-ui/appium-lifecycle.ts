import * as net from 'net';
import { main as startAppium } from 'appium';
import { logger } from '@utils/logger';

const log = logger.child({ layer: 'appium-lifecycle' });

const APPIUM_HOST = process.env.APPIUM_HOST || '127.0.0.1';
const APPIUM_PORT = parseInt(process.env.APPIUM_PORT || '4723', 10);

// Appium loglevel format: "console[:file]"
// e.g. "info" logs info+ to console; "info:debug" logs info+ to console and debug+ to file
type AppiumLogLevel = 'error' | 'warn' | 'info' | 'debug' | `${'error'|'warn'|'info'|'debug'}:${'error'|'warn'|'info'|'debug'}`;
const APPIUM_LOG_LEVEL = (process.env.APPIUM_LOG_LEVEL || 'info') as AppiumLogLevel;
const APPIUM_LOG_FILE = process.env.APPIUM_LOG_FILE; // optional: write logs to file (e.g. logs/appium.log)

let serverHandle: Awaited<ReturnType<typeof startAppium>> | undefined;

function isPortInUse(port: number, host: string): Promise<boolean> {
    return new Promise((resolve) => {
        const probe = net.createConnection({ port, host });
        probe.once('connect', () => { probe.destroy(); resolve(true); });
        probe.once('error', () => { probe.destroy(); resolve(false); });
    });
}

export async function bootAppiumServer(): Promise<void> {
    if (serverHandle) return; // idempotent — safe to call in parallel test workers

    const alreadyRunning = await isPortInUse(APPIUM_PORT, APPIUM_HOST);
    if (alreadyRunning) {
        log.info({ port: APPIUM_PORT }, '[Mobile-UI] Server already running — skipping boot');
        return;
    }

    log.info({ host: APPIUM_HOST, port: APPIUM_PORT, loglevel: APPIUM_LOG_LEVEL }, '[Mobile-UI] Booting server...');

    serverHandle = await startAppium({
        port: APPIUM_PORT,
        address: APPIUM_HOST,
        loglevel: APPIUM_LOG_LEVEL,
        logTimestamp: true,
        localTimezone: false,
        ...(APPIUM_LOG_FILE ? { log: APPIUM_LOG_FILE } : {}),
    });

    log.info({ port: APPIUM_PORT }, '[Mobile-UI] Server ready');
}

export async function shutdownAppiumServer(): Promise<void> {
    if (!serverHandle) return;

    await serverHandle.close();
    serverHandle = undefined;
    log.info('[Mobile-UI] Server stopped');
}
