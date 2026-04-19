import * as net  from 'net';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { logger } from '../utils/logger';

const log = logger.child({ layer: 'kernel', component: 'port-guard' });

const RECLAIM_TIMEOUT_MS = 5000;
const POLL_INTERVAL_MS   = 100;

/**
 * Ensures `port` is free before a server binds to it. If a stale copy of the
 * *current* entry script (matched by `identity`) is holding the port — e.g.
 * an orphan from a crashed launcher — it is reclaimed (SIGTERM, then SIGKILL).
 *
 * Refuses to kill processes whose command line does not contain `identity`,
 * throwing instead with a clear message — so an unrelated listener is never
 * clobbered.
 *
 * `identity` defaults to the last two path segments of `process.argv[1]`
 * (e.g. `kernel/chaos-proxy.ts`, `api/server.ts`) — unique enough to avoid
 * collisions between plugins while still matching the victim's cmdline.
 */
export async function ensurePortFree(
    port: number,
    identity: string = defaultIdentity(),
): Promise<void> {
    if (await isPortFree(port)) return;

    const pid = findPidOnPort(port);
    if (pid == null) return; // unknown holder — let bind fail naturally

    const cmd = readCmdline(pid);
    if (!cmd) {
        log.warn({ port, pid }, 'Port busy; could not read cmdline — not reclaiming');
        return;
    }

    if (!cmd.includes(identity)) {
        throw new Error(
            `Port ${port} is held by PID ${pid} (${cmd}) which does not match ` +
            `"${identity}". Refusing to kill. Stop it manually and retry.`,
        );
    }

    log.warn({ port, pid, cmd }, `Reclaiming port from stale instance`);
    try { process.kill(pid, 'SIGTERM'); } catch { /* already dead */ }

    await waitForFree(port, pid);
}

function defaultIdentity(): string {
    const entry = process.argv[1];
    if (!entry) return '';
    return entry.split(path.sep).slice(-2).join(path.sep);
}

function isPortFree(port: number): Promise<boolean> {
    return new Promise((resolve) => {
        const probe = net.createServer();
        probe.once('error',     () => resolve(false));
        probe.once('listening', () => probe.close(() => resolve(true)));
        probe.listen(port, '0.0.0.0');
    });
}

function findPidOnPort(port: number): number | null {
    try {
        const out = execFileSync(
            'lsof', ['-ti', `tcp:${port}`, '-sTCP:LISTEN'],
            { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
        ).trim();
        if (!out) return null;
        const pid = parseInt(out.split('\n')[0], 10);
        return Number.isFinite(pid) ? pid : null;
    } catch {
        return null; // lsof missing or nothing listening
    }
}

function readCmdline(pid: number): string | null {
    try {
        return execFileSync(
            'ps', ['-p', String(pid), '-o', 'command='],
            { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
        ).trim();
    } catch {
        return null;
    }
}

async function waitForFree(port: number, pid: number): Promise<void> {
    const deadline = Date.now() + RECLAIM_TIMEOUT_MS;

    while (Date.now() < deadline) {
        if (await isPortFree(port)) return;
        await sleep(POLL_INTERVAL_MS);
    }

    // Escalate to SIGKILL if SIGTERM didn't do it
    log.warn({ port, pid }, 'SIGTERM timed out — escalating to SIGKILL');
    try { process.kill(pid, 'SIGKILL'); } catch { /* gone */ }

    const hardDeadline = Date.now() + 2000;
    while (Date.now() < hardDeadline) {
        if (await isPortFree(port)) return;
        await sleep(POLL_INTERVAL_MS);
    }

    throw new Error(`Port ${port} still busy after SIGKILL on PID ${pid}`);
}

function sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
}
