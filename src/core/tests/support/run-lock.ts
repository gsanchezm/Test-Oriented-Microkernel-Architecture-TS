import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const LOCK_PATH = path.resolve(process.cwd(), '.ahm-run.lock');

interface LockPayload {
    pid: number;
    startedAt: string;
    host: string;
}

// Tracks the PID we wrote into the lock — release() refuses to delete a lock
// whose PID is not ours, defending against late-arriving signal handlers from
// a previous run racing a fresh acquire.
let ownPidWritten: number | null = null;

function isProcessAlive(pid: number): boolean {
    // process.kill(pid, 0) is the POSIX/Node convention for "does this PID exist
    // and am I allowed to signal it" — no signal is actually delivered.
    //   throws ESRCH  → no such process (dead)
    //   throws EPERM  → exists but we cannot signal (treat as ALIVE; conservative)
    //   no throw       → alive
    try {
        process.kill(pid, 0);
        return true;
    } catch (err) {
        const code = (err as NodeJS.ErrnoException).code;
        if (code === 'ESRCH') return false;
        return true;
    }
}

function writeOurLock(): void {
    const payload: LockPayload = {
        pid: process.pid,
        startedAt: new Date().toISOString(),
        host: os.hostname(),
    };
    fs.writeFileSync(LOCK_PATH, JSON.stringify(payload), { encoding: 'utf8' });
    ownPidWritten = process.pid;
}

export function acquireRunLock(): void {
    // Fast path: exclusive create. `wx` fails atomically with EEXIST if the
    // file is already there, so two concurrent acquires can never both win.
    try {
        const payload: LockPayload = {
            pid: process.pid,
            startedAt: new Date().toISOString(),
            host: os.hostname(),
        };
        fs.writeFileSync(LOCK_PATH, JSON.stringify(payload), { encoding: 'utf8', flag: 'wx' });
        ownPidWritten = process.pid;
        return;
    } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
    }

    // Slow path: file exists. Inspect the previous holder.
    let prev: LockPayload;
    try {
        prev = JSON.parse(fs.readFileSync(LOCK_PATH, 'utf8')) as LockPayload;
    } catch {
        // Corrupt lock — treat as stale, overwrite.
        writeOurLock();
        console.warn('[AHM] Found corrupt .ahm-run.lock; overwriting.');
        return;
    }

    if (isProcessAlive(prev.pid)) {
        throw new Error(
            `[AHM] Another test run is in progress on this machine.\n` +
            `  pid:        ${prev.pid}\n` +
            `  started at: ${prev.startedAt}\n` +
            `  host:       ${prev.host}\n\n` +
            `If you are certain no test is running, delete .ahm-run.lock and retry.`,
        );
    }

    console.warn(
        `[AHM] Found stale .ahm-run.lock from dead PID ${prev.pid} (started ${prev.startedAt}). Taking over.`,
    );
    writeOurLock();
}

export function releaseRunLock(): void {
    // Idempotent. Only delete if the lock on disk is ours.
    let onDisk: LockPayload;
    try {
        onDisk = JSON.parse(fs.readFileSync(LOCK_PATH, 'utf8')) as LockPayload;
    } catch {
        return;
    }

    if (ownPidWritten !== null && onDisk.pid === ownPidWritten) {
        try { fs.unlinkSync(LOCK_PATH); } catch { /* best-effort */ }
        ownPidWritten = null;
    }
}
