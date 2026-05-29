# Framework-notes fixes — 2026-05-24

Acts on the three items raised in `FRAMEWORK_NOTES.md` after the 2026-05-23 multi-platform test run. Items are independent; they're bundled here because they all sit at the framework boundary (kernel launcher, package scripts, test harness) and a single design pass keeps them coherent.

## Goals

1. Confirm the `spawn pnpm ENOENT` fix on Windows is correct and committable as-is.
2. Make `pnpm perf:*` scripts work natively under Windows `cmd`/PowerShell without requiring Git Bash.
3. Prevent two concurrent `cucumber-js` processes from corrupting one shared Playwright browser session.

## Non-goals

- Refactoring the proxy or plugin lifecycle.
- Supporting *legitimate* parallel runs (CI shards, multi-worker). If/when that lands, the lock becomes per-worker; out of scope today.
- Re-baselining visual snapshots (the run also surfaced visual drift; that's a CI workflow concern, not a framework defect).

## Item 1 — `spawn pnpm ENOENT` on Windows (already fixed)

**Location:** `src/kernel/start-plugins.ts:26-30`.

**Change applied (already on disk, staged as `M` in git status):**
```ts
const child = spawn('pnpm', ['run', plugin.script], {
    env:   { ...process.env },
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: true,
});
```
Inline comment justifies why `shell: true` is safe: args originate from `plugins.config.ts` (trusted, no user-supplied data), so there is no shell-injection surface.

**Verification:** restart `pnpm run plugins`; children should bind their ports (`50052 playwright`, `50055 api`, ...) without ENOENT.

**Action in this design:** none — only call out the file so the user knows to commit it alongside the other changes in the same PR.

## Item 2 — `cross-env` for POSIX env prefix in `perf:*` scripts

### Problem

`package.json:25-30` defines 6 scripts that use the POSIX inline-env prefix:
```
"perf:smoke":   "PERF_PROFILE=smoke   node -r dotenv/config …",
"perf:load":    "PERF_PROFILE=load    node …",
"perf:stress":  "PERF_PROFILE=stress  node …",
"perf:login-invalid:smoke":  "PERF_PROFILE=smoke   node …",
"perf:login-invalid:load":   "PERF_PROFILE=load    node …",
"perf:login-invalid:stress": "PERF_PROFILE=stress  node …",
```
On Windows, pnpm runs scripts through `cmd`, which does not parse `VAR=value cmd`. Result: `"PERF_PROFILE" no se reconoce como un comando interno o externo` and `ELIFECYCLE` exit 1.

### Solution: add `cross-env` as a devDependency and prefix each affected script.

```bash
pnpm add -D cross-env
```

Then in `package.json`:
```diff
- "perf:smoke":  "PERF_PROFILE=smoke node -r dotenv/config …",
+ "perf:smoke":  "cross-env PERF_PROFILE=smoke node -r dotenv/config …",
```
…and equivalent for the other five scripts.

### Why this over `.npmrc script-shell=bash`

- `cross-env` is scoped to the scripts that need it; `script-shell=bash` affects *every* script and forces a fixed Git Bash path on every Windows machine.
- No behavior change on Linux/macOS (cross-env passes through).
- One ~3 KB devDep, no environment assumptions.

### Verification

1. On Windows (cmd or PowerShell): `pnpm perf:smoke` — Gatling should start and complete without the locale error.
2. On Linux/macOS: same scripts should keep working (`pnpm perf:smoke` already passes there).
3. `preperf:*` hooks (which call `pnpm run perf:generate`) are unaffected — they don't use inline env.

## Item 3 — Single-cucumber-run lock (`.ahm-run.lock`)

### Problem

The microkernel happily accepts a second gRPC client. The Playwright plugin holds **one** browser session and serves whichever intent arrives first. Two concurrent `cucumber-js` processes interleave intents into the same browser, producing failures like `Target page, context or browser has been closed` and `Execution context was destroyed`. During the 2026-05-23 run this manifested as ~8 phantom test failures that look like real product bugs.

### Solution: lock at the harness boundary, not the proxy

The shared resource is the Playwright browser, but the cheap, robust place to gate access is the cucumber harness itself. One `cucumber-js` invocation = one tenant. Anyone trying to start a second invocation while one is running fails fast with a clear message.

A proxy-side guard would also work but requires tracking gRPC client identity, surfacing a new error code, and handling the case where a legitimate "second cucumber" (e.g., a sharded CI run) is added later. The harness lock is one file and ~80 lines of code.

### Components

- **New module:** `src/core/tests/support/run-lock.ts`
  - `acquireRunLock(): void` — called from `BeforeAll`. Throws on collision.
  - `releaseRunLock(): void` — called from `AfterAll` and from process exit handlers. Idempotent. Only deletes the lock if the file's PID matches our own.
- **Modified:** `src/core/tests/support/hooks.ts`
  - `BeforeAll` calls `acquireRunLock()` before any current logic.
  - `AfterAll` calls `releaseRunLock()` at the end (after telemetry flush).
  - `process.on('exit')`, `SIGINT`, `SIGTERM` handlers also call `releaseRunLock()` (sync filesystem ops so they complete during abnormal shutdown).
- **`.gitignore`:** add an explicit `.ahm-run.lock` entry. The repo's existing tmp patterns wouldn't cover a dotfile in root.

### Lockfile format

`<repo>/.ahm-run.lock` (UTF-8 JSON, single line):
```json
{ "pid": 12345, "startedAt": "2026-05-24T10:30:00.000Z", "host": "DESKTOP-ABC" }
```

### Acquisition algorithm

```
try open(.ahm-run.lock, flags='wx')                  # exclusive create
  → write JSON, store our own PID in module state, return
  ↳ catch EEXIST:
        read .ahm-run.lock → JSON
        try process.kill(prevPid, 0)
          → no throw: previous run is alive → THROW with clear message
          → ESRCH:    previous run is dead  → overwrite the file with our own JSON,
                                              log a warning, continue
          → EPERM:    can't signal (permissions/cross-user) → treat as ALIVE (conservative);
                                              user must remove manually
```

The collision error reads:
```
[AHM] Another test run is in progress on this machine.
  pid:        12345
  started at: 2026-05-24T10:30:00.000Z
  host:       DESKTOP-ABC

If you are certain no test is running, delete .ahm-run.lock and retry.
```

### Release algorithm

```
read .ahm-run.lock if present
  → if JSON.pid === our PID → unlink
  → otherwise            → no-op (do not delete someone else's lock)
all errors are swallowed (release is best-effort)
```

Release must be **synchronous** in the exit/signal path so it completes before Node tears down — `fs.readFileSync` / `fs.unlinkSync`.

### Race-condition analysis

- **Two starts collide on `wx`:** filesystem-atomic exclusive create wins for one; the other gets `EEXIST` and falls into the alive-check branch.
- **Stale lock + new start:** PID check resolves it. Worst case (EPERM on a multi-user box) we surface the message and the user removes manually — strictly better than silently sharing the browser.
- **Self-delete race during a hard kill:** signal handler tries to release while another run is starting. Mitigated by "only delete if PID matches" — the second run never sees its own PID in someone else's lock, so the late-arriving cleanup is a no-op.
- **CI sharding (future):** lock keyed by repo path is not enough if multiple shards want to run in parallel. That migration path is: per-shard lock filename derived from `process.env.AHM_SHARD_ID || 'default'`. Out of scope here; the current lock is a global gate per repo checkout.

### What stays untouched

- `src/kernel/chaos-proxy.ts` — proxy remains stateless w.r.t. clients.
- `src/kernel/start-plugins.ts` (beyond item 1).
- `src/plugins/playwright/server.ts` — plugin keeps its current single-session model; the harness lock means only one cucumber ever asks for that session at a time.

## File-by-file change list

| File                                           | Change                                                               |
|------------------------------------------------|----------------------------------------------------------------------|
| `src/kernel/start-plugins.ts`                  | Already modified (item 1) — verify and commit.                       |
| `package.json`                                 | Add `cross-env` devDep, prefix 6 `perf:*` scripts.                   |
| `pnpm-lock.yaml`                               | Regenerated by `pnpm add`.                                           |
| `src/core/tests/support/run-lock.ts`           | **New.** `acquireRunLock` / `releaseRunLock` + PID-based liveness.   |
| `src/core/tests/support/hooks.ts`              | Wire `acquireRunLock` into `BeforeAll`; release in `AfterAll` + signal handlers. |
| `.gitignore`                                   | Add `.ahm-run.lock`.                                                 |
| `FRAMEWORK_NOTES.md`                           | Mark items 2 and 3 as FIXED with verification notes; leave item 1 unchanged. |

## Verification plan

**Item 1:** `pnpm run plugins` on Windows; expect each enabled plugin to bind its configured port (50052, 50055, …) without `ENOENT`.

**Item 2:** on Windows, run each of the 6 scripts. Each should complete Gatling normally and write the report under `target/gatling/<report>/`. Spot-check Linux to confirm no regression.

**Item 3:**
1. Open two PowerShell windows.
2. In the first, run `pnpm test`. Confirm `.ahm-run.lock` is created.
3. In the second, run `pnpm test` immediately. Confirm it aborts with the collision message **before** any scenario starts (no telemetry written, no browser opened).
4. Ctrl+C the first run. Confirm `.ahm-run.lock` is removed by the signal handler.
5. Re-run `pnpm test` in either window — succeeds.
6. Stale-lock test: leave `.ahm-run.lock` referencing PID 99999 (nonexistent). Run `pnpm test`. Expect it to overwrite the lock with a warning and continue.

## Out of scope (explicit)

- Proxy-side concurrency rejection (requires gRPC client tracking; saved for a later design if CI sharding lands).
- Re-baselining the 14 visual drifts from the 2026-05-23 run (handled by `update-visual-baselines.yml` workflow_dispatch, per `CLAUDE.md`).
- Touching POSIX behavior on Linux/macOS — `cross-env` is no-op there; lockfile works the same.
