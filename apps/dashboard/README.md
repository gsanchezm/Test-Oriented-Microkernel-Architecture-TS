# Test Automation Dashboard

React + Vite + TypeScript dashboard that visualizes test-run results from JSON files on disk. No database — the server reads `./reports/manifest.json` and per-run JSON files, normalizes each tool's output through a dedicated adapter, and serves the result as `/api/runs/...`.

The design spec lives in `docs/superpowers/specs/2026-05-24-test-dashboard-design.md` (local-only — `docs/` is gitignored).

---

## Quick start

From the **repo root** (not from `apps/dashboard/`):

```bash
pnpm install                # if you haven't already (workspace-aware)
pnpm dashboard:fixtures     # one-shot: writes reports/manifest.json + 2 demo runs + 30 placeholder PNGs
pnpm dashboard              # starts vite (:5173) + express (:8787) concurrently
```

Then open <http://localhost:5173>. The first paint loads `/api/runs`, picks the most recent runId, and redirects to `/runs/<latest>`.

To stop everything, **Ctrl-C the `pnpm dashboard` terminal** — on Windows the parent `concurrently` process spawns child `node` instances that survive a plain TaskKill. If a port stays bound, kill it explicitly:

```powershell
# PowerShell — list and kill whatever is on 5173 / 8787
Get-NetTCPConnection -State Listen -LocalPort 5173,8787 | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

---

## All scripts

Run any of these from the repo root (they proxy through `pnpm --filter dashboard <name>`):

| Script | What it does |
|---|---|
| `pnpm dashboard` | Dev: vite (`:5173`) + express (`:8787`). Vite proxies `/api` and `/reports` to the server. Single URL to use: <http://localhost:5173>. |
| `pnpm dashboard:build` | Production build of the client into `apps/dashboard/dist/client/`. |
| `pnpm dashboard:fixtures` | (Re)generates `./reports/manifest.json` + 2 demo runs + 30 placeholder PNGs. Safe to re-run; overwrites in place. |
| `pnpm dashboard:ingest` | One-shot: converts the framework's existing cucumber-JSON output (`reports/playwright.json`, `reports/api.json`, optionally `reports/android.json` + `reports/ios.json`) into a new dashboard run. Adds a manifest entry. Env vars `PROJECT`, `BUILD`, `BRANCH`, `COMMIT`, `RUN_ENV`, `TRIGGERED_BY`, `ANDROID_DEVICE`, `IOS_DEVICE` override defaults. `--run-id my-id` to set the runId explicitly (default: `real-YYYY-MM-DDTHH-MM`). |
| `pnpm --filter dashboard start` | Production: runs the server (which serves `dist/client` + `/api` + `/reports`) on `PORT` (default 8787). |
| `pnpm --filter dashboard test` | Vitest: adapter contract tests + registry coverage check. |
| `pnpm --filter dashboard typecheck` | `tsc --noEmit` over client + server + scripts. |
| `pnpm --filter dashboard smoke` | Headless Playwright: navigates every route, screenshots into `apps/dashboard/tmp/smoke/`, fails if any `pageerror` / `console.error` fires. **Requires `pnpm dashboard` running in another terminal.** |

Environment knobs (server-side):
- `PORT` — express port (default `8787`).
- `REPORTS_DIR` — absolute path to the reports directory (default `<repoRoot>/reports`). Set this if your CI writes reports elsewhere.
- `NODE_ENV=production` — server serves the built client from `dist/client/` and adds the SPA fallback. In dev (default), vite serves the client and the server only handles `/api` and `/reports`.

---

## Folder layout

```
apps/dashboard/
  package.json
  tsconfig.json
  vite.config.ts          # /api + /reports proxied to :8787 in dev
  vitest.config.ts        # aliases match tsconfig
  index.html
  src/
    client/               # React + Vite (port :5173 in dev)
      main.tsx App.tsx router.tsx api.ts
      components/         # Topbar, RunPicker, ToolCard, HeroStrip,
                          # PassFailDonut, Speedometer, DiffTriplet,
                          # KpiStrip, FilterBar, TestList, DetailHead, ToolLogo
      views/
        Overview.tsx ToolDetail.tsx RootRedirect.tsx EmptyManifest.tsx NotFound.tsx
        detail/           # GenericDetail (web_ui + api), MobileDetail (mobile_ui),
                          # PerformanceDetail (performance), VisualDetail (visual)
      registry/tool-registry.ts   # kind → detail component
      styles/styles.css            # ported 1:1 from prototype
    server/               # Express + tsx (port :8787)
      index.ts routes/runs.ts runs-repo.ts
      normalize/          # ADAPTERS registry + one file per tool
        index.ts shared.ts
        playwright.ts appium.ts api.ts gatling.ts pixelmatch.ts
    shared/
      kinds.ts types.ts   # Tool union, ToolKind, ManifestEntry, ToolSummary, RunPayload
  public/assets/logos/    # SVG logos served at /assets/logos/<toolId>.svg
    playwright.svg appium.svg api.svg gatling.svg pixelmatch.svg
    platforms/android.svg platforms/ios.svg
  scripts/
    generate-fixtures.ts  # writes reports/* on demand
    smoke.ts              # headless playwright smoke
  test/
    adapters/*.test.ts    # one per adapter
    registry.test.ts      # ADAPTERS ↔ DETAIL_BY_KIND ↔ logo files

reports/                  # at the repo root, NOT under apps/dashboard/
  manifest.json
  <runId>/
    run.json
    playwright.json appium.json api.json gatling.json pixelmatch.json
    pixelmatch/<baseline>-{baseline,actual,diff}.png
```

`reports/` is gitignored at the repo level (line 95 of `.gitignore`). Demo fixtures regenerate on demand via `pnpm dashboard:fixtures`. Real CI runs would also write here.

---

## HTTP API

| Method | Path | Returns |
|---|---|---|
| `GET` | `/api/health` | `{ ok, reportsDir, env }` — sanity check. |
| `GET` | `/api/runs` | `ManifestEntry[]` sorted by `startedAt` descending. |
| `GET` | `/api/runs/:runId` | `{ run: RunInfo, tools: ToolSummary[] }` — the overview payload. `ToolSummary` strips `tests[]`, `diffs[]`, `perf.distribution[]`, `perf.scenarios[]` so the overview page is small. |
| `GET` | `/api/runs/:runId/tools/:toolId` | Full `Tool` (with `tests[]` / `diffs[]` / full `perf`). |
| `GET` | `/reports/:runId/pixelmatch/*.png` | Static PNGs. Path-traversal-safe (every fs access goes through `runs-repo.ts`'s `safeResolve`). |
| `GET` | `/assets/*` | Static logos (in prod; in dev Vite serves these from `public/`). |
| `GET` | `*` (production only) | `dist/client/index.html` — SPA fallback. |

Error responses are JSON:
- `404 { error: 'run_not_found', runId }`
- `404 { error: 'tool_not_found', toolId }`
- `500 { error: 'report_missing', file }` — run is in manifest but a JSON is missing.
- `500 { error: 'internal_error', message }`

---

## Adapter contract (how to wire real data)

Each tool's raw JSON on disk goes through one adapter (one file per tool under `src/server/normalize/`). The adapter is a typed function:

```ts
type Adapter = (raw: unknown, ctx: AdapterContext) => Tool | Promise<Tool>;

interface AdapterContext {
  runId: string;       // e.g. "2026-05-24-build-4582"
  runDir: string;      // absolute path to reports/<runId>
  runInfo: RunInfo;    // already parsed run.json
}
```

The canonical `Tool` union is a discriminated type by `kind`. See `src/shared/types.ts` for the full shape. Briefly:

- `web_ui` / `api` → `{ ..., tests: TestCase[] }`
- `mobile_ui` → `{ ..., platforms: { android: PlatformBlock, ios: PlatformBlock } }`
- `performance` → `{ ..., perf: { rps, p95Ms, distribution[], scenarios[], ... } }`
- `visual` → `{ ..., diffs: [{ baseline, diffPct, status, images: { baseline, actual, diff } }] }`

**v1 adapters are pass-through.** Each one casts the raw JSON to its expected shape and stamps the right `kind`. The pixelmatch adapter is the only one with real work — it resolves the `images.*` URLs.

To consume real framework output, rewrite the body of each adapter. The signature and the registry entry stay the same; the client doesn't change.

See "Wiring real reports" below for a concrete plan.

---

## Tool-kind registry — adding a new tool

Two files, two edits:

1. **Server** — `src/server/normalize/index.ts`:
   ```ts
   import { cypressAdapter } from './cypress.js';
   export const ADAPTERS = {
     // ...existing...
     cypress: { id: 'cypress', kind: 'web_ui', adapter: cypressAdapter },
   };
   ```
   Write `src/server/normalize/cypress.ts` with the adapter. If the kind is one of the five already supported (`web_ui`, `mobile_ui`, `api`, `performance`, `visual`), there's no client-side change.

2. **Client** — drop `public/assets/logos/cypress.svg`. The card and detail header pick it up automatically via `/assets/logos/cypress.svg`.

If the new tool needs a brand-new kind (say `accessibility`):
- Add it to `ToolKind` in `src/shared/kinds.ts` and to the `TOOL_KINDS` array.
- Create `src/client/views/detail/AccessibilityDetail.tsx`.
- Add a mapping in `src/client/registry/tool-registry.ts` — the `Record<ToolKind, DetailComponent>` type forces exhaustiveness, so TS will tell you if you miss it.

---

## Wiring real reports (replacing the mock fixtures)

The dashboard is wire-format-stable: as long as `reports/<runId>/<toolId>.json` parses to something the adapter understands, the UI works. There are two compatible paths.

**Path A — write canonical JSON from CI.** Your pipeline transforms raw framework output into the `Tool` shape and drops it on disk. Adapters stay pass-through. Simplest, no adapter changes needed. Downside: the transform logic lives outside the dashboard.

**Path B — adapters parse raw output.** Your pipeline copies raw framework output (cucumber JSON, gatling `stats.json`, etc.) into `reports/<runId>/`. Each adapter parses the framework's native shape. Recommended for long-term — the dashboard owns the contract.

Step-by-step for Path B (recommended):

1. **Pick a runId convention.** The fixtures use `YYYY-MM-DD-<buildId>`. Stick with that or use the CI run ID. The runId is the directory name and the manifest's lookup key.

2. **Write `reports/<runId>/run.json`** with the `RunInfo` shape (project, buildId, branch, commit, triggeredBy, startedAt, duration, env). A small shell or node step in your CI fills this from environment variables and `git log -1`.

3. **Drop the raw outputs into the run directory** with the names the dashboard expects. The repo's existing framework already produces most of these:

   | Tool | Existing framework output | Dashboard expects |
   |---|---|---|
   | Playwright | `reports/playwright.json` (cucumber JSON via `pnpm test:json:playwright`) | `reports/<runId>/playwright.json` |
   | API | `reports/api.json` (cucumber JSON via `pnpm test:json:api`) | `reports/<runId>/api.json` |
   | Appium Android | `reports/android.json` (cucumber JSON via `pnpm test:json:android`) | merged into `reports/<runId>/appium.json` |
   | Appium iOS | `reports/ios.json` (cucumber JSON via `pnpm test:json:ios`) | merged into `reports/<runId>/appium.json` |
   | Gatling | `target/gatling/<report>/js/stats.json` | `reports/<runId>/gatling.json` |
   | PixelMatch | `visual-results/<runId>/<feature>/<snapshotId>/<platform>/<viewport>/[<market>/][<language>/]result.json` | `reports/<runId>/pixelmatch.json` + the actual `.png` files into `reports/<runId>/pixelmatch/` |

   For Appium, either merge `android.json` + `ios.json` into a single `appium.json` in the CI step, or change the adapter to read both files (the adapter has the `runDir` in its context — it can `fs.readFile` siblings).

4. **Rewrite each adapter to parse its native format.** Open `src/server/normalize/<tool>.ts` and replace the pass-through body with real parsing. The Vitest tests in `test/adapters/*.test.ts` give you a fast feedback loop — write the new test first against a real CI output sample, then make the adapter pass.

   The shapes you'll likely write parsers for:
   - cucumber JSON → `TestCase[]` + counts (one parser, used by playwright + api + appium).
   - Gatling `stats.json` → `PerfBlock` (rps, latencies, distribution, scenarios — see [Gatling docs](https://docs.gatling.io/reference/extensions/junit/)).
   - PixelMatch `result.json` walk → `VisualDiff[]`. Copy the PNGs into `reports/<runId>/pixelmatch/<baseline>-{baseline,actual,diff}.png` so the existing URL convention works (or change `pixelmatchAdapter`'s URL builder to point wherever you stored them).

5. **Append to `reports/manifest.json`.** A tiny CI step:
   ```jsonc
   // append to the array
   { "runId": "2026-05-24-build-4582",
     "project": "Acme Storefront",
     "buildId": "build-4582",
     "branch": "main",
     "startedAt": "2026-05-24 09:42:11" }
   ```
   The server sorts by `startedAt` descending; new runs land at the top of the picker.

6. **Restart the server** (or just refresh the page — the server reads JSON on every request, no in-memory caching).

A pragmatic shortcut while you're building this: write **one** real adapter (start with Playwright, since cucumber JSON is well-defined) and leave the other four pass-through. The dashboard happily mixes real and mock data per tool. Validate one slice end-to-end before tackling the rest.

### Shortcut already wired: `pnpm dashboard:ingest`

The "Path A" shortcut is implemented in `apps/dashboard/scripts/ingest-run.ts`. It reads whichever of `reports/playwright.json`, `reports/api.json`, `reports/android.json`, `reports/ios.json` are present, transforms cucumber JSON into the canonical `Tool` shape, drops them under `reports/<runId>/`, and appends a manifest entry. The dashboard then sees a new entry in the run-picker labeled `real-YYYY-MM-DDTHH-MM` (or whatever you passed via `--run-id`).

### Playwright browser sub-tabs

Playwright can run across multiple browsers. To get per-browser sub-tabs in the
detail view (mirroring the mobile Android/iOS tabs), produce one cucumber JSON
per browser named `reports/playwright-<browser>.json` where `<browser>` is one
of `chrome`, `chromium`, `firefox`, `edge`, `webkit`, `safari`. The ingest
detects them, builds a `browsers[]` breakdown, and the detail view renders a tab
per browser with its logo. With a single flat `reports/playwright.json` (no
per-browser files) the detail view shows one flat test list — no tabs.

Non-browser suffixes are ignored: `reports/playwright-visual.json` (the
`@visual` subset from `test:json:visual`) is NOT treated as a browser.

Browser logos live at `public/assets/logos/browsers/<browser>.svg`. Swap a logo
by replacing the file; the lookup is in `src/client/components/ToolLogo.tsx`.

### Tools the script handles today
- ✅ Playwright (cucumber JSON → `WebUiTool`; per-browser sub-tabs when `playwright-<browser>.json` files exist)
- ✅ API (cucumber JSON → `ApiTool`)
- ✅ Appium (`android.json` + `ios.json` merged → `MobileUiTool`, only if both files exist)
- ✅ Gatling (parses the most recent `target/gatling/jssimulation-*/index.html` table → `PerformanceTool`. Logic in `scripts/ingest-gatling.ts`.)
- ✅ PixelMatch (walks the most recent `visual-results/<runId>/.../result.json`, copies `actual.png` + `diff.png` + the absolute `baselinePath` into `reports/<runId>/pixelmatch/<key>-{baseline,actual,diff}.png` → `VisualTool`. Logic in `scripts/ingest-pixelmatch.ts`.)

Any tool that doesn't have data this run still appears as a card on the Overview, in a muted/dashed state with the "No data this run" chip — and its detail page is a self-describing "not ingested" panel. The dashboard renders the run with whatever tools it finds.

Per-tool overrides for the ingest:
- Gatling looks for `target/gatling/jssimulation-*` ordered by mtime. Set `--gatling-dir <abs path>` (TODO) to override, or run the ingest right after your `pnpm perf:*` command.
- PixelMatch looks for the most recent `visual-results/tom-*`. The runId in the visual-results folder name is independent of the dashboard's runId. If you want a specific visual run, point `visualRunDir` at it from a wrapper script.

The (market, language) bucketing documented in `src/plugins/pixelmatch/support/visual-paths.ts` is preserved — the baseline key becomes `<feature>__<snapshotId>__<platform>__<viewport>__<market>__<language>` (with the trailing segments dropped when absent), so different localizations of the same screen don't collide.

---

## Gotchas

- **`pnpm test` from the repo root runs cucumber-js, not the dashboard's Vitest.** Use `pnpm --filter dashboard test` for the dashboard's tests.
- **`reports/` is gitignored** — your local fixtures don't follow you to other clones. Re-run `pnpm dashboard:fixtures` after a fresh clone.
- **PNG cache** — `/reports/*` has `Cache-Control: public, max-age=3600`. If you replace a fixture PNG and the browser shows the old one, hard-refresh.
- **OKLCH colors** require a modern browser. The CSS uses them throughout the purple theme. Chrome/Firefox/Safari all support them; older browsers will see flat fallbacks (the theme is still readable, just not as rich).
- **Vite proxy is host-bound to `localhost`.** If you want to hit the dashboard from another machine on the LAN, run `pnpm --filter dashboard build` then `NODE_ENV=production PORT=8787 pnpm --filter dashboard start` — the express server binds `0.0.0.0` by default.
- **`tsx` (the runner) is not `.tsx` (the file extension).** Server-side code is plain `.ts`; the package name `tsx` is the TypeScript executor that runs the server in dev (`tsx watch src/server/index.ts`) and prod (`tsx src/server/index.ts`).
