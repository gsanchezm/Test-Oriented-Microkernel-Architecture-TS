// Standalone smoke test for the run-lock module.
// Pattern matches scripts/visual-gate.js: assert, exit non-zero on failure.
// Run with: pnpm exec ts-node -r tsconfig-paths/register scripts/smoke/run-lock-smoke.ts

import * as fs from 'fs';
import * as path from 'path';
import { acquireRunLock, releaseRunLock } from '../../src/core/tests/support/run-lock';

const LOCK_PATH = path.resolve(process.cwd(), '.ahm-run.lock');

function assert(cond: unknown, msg: string): asserts cond {
    if (!cond) {
        console.error(`[FAIL] ${msg}`);
        process.exit(1);
    }
    console.log(`[PASS] ${msg}`);
}

function cleanup(): void {
    try { fs.unlinkSync(LOCK_PATH); } catch { /* not present, ignore */ }
}

function readLock(): { pid: number; startedAt: string; host: string } {
    return JSON.parse(fs.readFileSync(LOCK_PATH, 'utf8'));
}

function main(): void {
    // Scenario 1: clean acquire
    cleanup();
    acquireRunLock();
    assert(fs.existsSync(LOCK_PATH), 'scenario 1: lockfile created on clean acquire');
    const first = readLock();
    assert(first.pid === process.pid, 'scenario 1: lockfile contains our PID');
    assert(typeof first.startedAt === 'string' && first.startedAt.length > 0,
        'scenario 1: lockfile has startedAt');

    // Scenario 2: double-acquire from same process — second call must throw
    let threw = false;
    try { acquireRunLock(); }
    catch (e) {
        threw = true;
        const msg = (e as Error).message;
        assert(msg.includes('Another test run is in progress'),
            'scenario 2: collision error contains expected wording');
    }
    assert(threw, 'scenario 2: second acquire throws');

    // Scenario 3: release removes the lock
    releaseRunLock();
    assert(!fs.existsSync(LOCK_PATH), 'scenario 3: releaseRunLock removes the file');

    // Scenario 4: stale-lock recovery — write a lock with a dead PID, then acquire
    fs.writeFileSync(LOCK_PATH, JSON.stringify({
        pid: 999999,                              // unlikely to be a real PID
        startedAt: '2000-01-01T00:00:00.000Z',
        host: 'stale-host',
    }), 'utf8');
    acquireRunLock();
    const fresh = readLock();
    assert(fresh.pid === process.pid, 'scenario 4: stale lock overwritten with our PID');

    // Scenario 5: release only deletes if PID matches
    fs.writeFileSync(LOCK_PATH, JSON.stringify({
        pid: 1,                                   // not us
        startedAt: '2000-01-01T00:00:00.000Z',
        host: 'someone-else',
    }), 'utf8');
    releaseRunLock();
    assert(fs.existsSync(LOCK_PATH), 'scenario 5: release leaves a non-matching lock intact');

    cleanup();
    console.log('\nAll run-lock smoke scenarios passed.');
}

main();
