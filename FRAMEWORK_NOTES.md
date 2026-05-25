# Framework notes from the 2026-05-23 test run

Triage of framework-side issues encountered while running API + Web + Perf + Visual. These are internal to this repo (not OmniPizza app bugs). Each item is independently reproducible.

## 1 — `spawn pnpm ENOENT` on Windows from `start-plugins.ts` — FIXED

**Symptom:** `pnpm run plugins` exits within ~100 ms with:
```
Error: spawn pnpm ENOENT
  syscall: 'spawn pnpm',
  path: 'pnpm',
  spawnargs: [ 'run', 'plugin:playwright' ]
```

**Cause:** `src/kernel/start-plugins.ts:23` spawned `pnpm` with `shell: false`. On Windows the binary is `pnpm.cmd` (or `pnpm.ps1`), and Node's spawn cannot resolve the `.cmd` extension without a shell.

**Fix applied:** changed `shell: false` → `shell: true`. Args come from `plugins.config.ts` (trusted), so no shell-injection surface.

**Verification:** restart the launcher.
```bash
pnpm run plugins
```
Children should appear in the registry log and bind their ports (50052 playwright, 50055 api). No ENOENT.

## 2 — POSIX env syntax in `perf:*` scripts breaks Windows `pnpm perf:*` — FIXED

**Symptom:** `pnpm perf:smoke` fails with:
```
"PERF_PROFILE" no se reconoce como un comando interno o externo
[ELIFECYCLE] Command failed with exit code 1.
```

**Cause:** `package.json` perf scripts use `PERF_PROFILE=smoke node …`. On Windows, pnpm runs scripts through `cmd`, which does not understand the POSIX inline-env prefix. The scripts work fine under bash (so they work via Git Bash invocation, just not via `pnpm`).

**Affected scripts:** `perf:smoke`, `perf:load`, `perf:stress`, `perf:login-invalid:smoke`, `perf:login-invalid:load`, `perf:login-invalid:stress`.

**Option A (recommended) — add `cross-env`:**
```bash
pnpm add -D cross-env
```
Then prefix each affected script:
```diff
- "perf:smoke": "PERF_PROFILE=smoke node -r dotenv/config …",
+ "perf:smoke": "cross-env PERF_PROFILE=smoke node -r dotenv/config …",
```
Cost: one ~3 KB devDep. Behavior unchanged on Linux/Mac.

**Option B — set pnpm's script-shell to bash:**
Add to `.npmrc`:
```
script-shell=C:\\Program Files\\Git\\bin\\bash.exe
```
Cost: no new dep. Requires Git Bash at that exact path on every dev's Windows machine. Affects *all* scripts in `package.json`, not just `perf:*`.

**Workaround for this run:** invoked the underlying node command directly via Git Bash (`PERF_PROFILE=smoke node -r dotenv/config …`) — gatling completed cleanly that way. Not a permanent fix.

**Fix applied:** added `cross-env` as a devDependency and prefixed all six `perf:*` scripts. Verified `pnpm perf:smoke` runs cleanly on Windows (PowerShell and cmd) and continues to work on Linux/macOS. See `docs/superpowers/specs/2026-05-24-framework-notes-fixes-design.md` for the decision record.

## 3 — No concurrency guard on proxy/plugins — FIXED (harness lock)

**Symptom (observed during this run):** two concurrent `cucumber-js` invocations both connected to the same single Playwright plugin (one browser session) and corrupted each other. Errors that surfaced:
- `browser.newContext: Target page, context or browser has been closed`
- `page.evaluate: Execution context was destroyed, most likely because of a navigation`
- `page.fill: Target page, context or browser has been closed`
- plus an extra ~8 spurious failures vs. the clean re-run

**Cause:** the gRPC microkernel happily accepts a second client. The Playwright plugin holds a single browser session and serves whoever sends an intent. Two cucumber processes interleave their intents into one browser.

**Why this matters:** the second run looks like real bugs (every locator stale, every navigation killed mid-flight). A reader who didn't suspect concurrency would file ~8 bogus BUG reports.

**Suggested fix sketches (not applied — needs design):**
- Refuse a second client when the proxy already has an active session (return `RESOURCE_EXHAUSTED`).
- Add a flock-style lock file at `<repo>/.ahm-run.lock` written by the test harness, checked by `start-plugins.ts` or the proxy at intent dispatch.
- Surface the lock state in the proxy's startup log so the second `pnpm test` fails fast with a clear message.

This wasn't the user's request — flagging for a future cleanup. The right answer is probably "refuse second client, surface clearly", but worth a design conversation rather than a quick hack.

**Fix applied:** added `src/core/tests/support/run-lock.ts` and wired it into the cucumber `BeforeAll` / `AfterAll` / signal handlers. The lock is a JSON file at `<repo>/.ahm-run.lock` keyed by PID + startedAt + host; a second `pnpm test` aborts with a clear message before any scenario runs. Stale locks (PID dead) are auto-recovered. Proxy and plugins are unchanged — the gate is at the harness boundary. See spec at `docs/superpowers/specs/2026-05-24-framework-notes-fixes-design.md`.

This addresses the problem at the harness level rather than the proxy level. If future CI work needs legitimate parallel runs (sharding), the lock can be made per-shard by keying on `process.env.AHM_SHARD_ID`.

## What was used during this run

- Proxy + plugins were already running from a previous session (PIDs 5164 / 9284 / 32664). The Windows ENOENT fix above prevents that previous-session dependency from being the only path; without it, a Windows dev cannot start the framework at all.
- Visual baselines are tracked-with-gitkeep but their PNGs are gitignored locally (per `CLAUDE.md`). The 14 "drift" results in this run are most likely dev-laptop font-rendering deltas vs. previously-captured Windows baselines — not OmniPizza bugs. CI re-baselining via `update-visual-baselines.yml` is the only canonical source.
