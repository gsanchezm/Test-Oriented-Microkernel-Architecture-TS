# Test Automation Dashboard — Design

**Date:** 2026-05-24
**Scope:** v1 — port the HTML prototype to a React + Vite + TypeScript app with a tiny Express server, reading mock JSON reports from disk. Foundation for wiring real framework outputs later.

## 1. Goals

Port `docs/handsoff/AHM/` 1:1 (purple OKLCH theme, donut + speedometers + pixel-diff triplets, Appium platform tabs) into a maintainable React app that:

- Reads JSON reports from `./reports/` on disk (no database).
- Discovers available runs via a curated `reports/manifest.json`.
- Normalizes each tool's raw JSON through a dedicated adapter, producing a canonical `Tool` shape consumed by the UI.
- Treats the 5 current tools (Playwright / Appium / API / Gatling / PixelMatch) as instances of 5 generic kinds (`web_ui`, `mobile_ui`, `api`, `performance`, `visual`) so adding Cypress or k6 later is one new adapter + one new SVG.
- Uses React Router (`/runs/:runId`, `/runs/:runId/:toolId`) instead of the prototype's hash routing.

**v1 ships with mock fixtures only.** Real adapter wiring against the framework's output is explicitly out of scope for this iteration — the adapter contract is defined and stubbed so a follow-up can plug each tool in without UI changes.

## 2. Non-goals (v1)

- Wiring against real Playwright / Appium / API / Gatling / PixelMatch outputs in the existing repo. Adapters are stubs that pass-through fixture JSON; real parsing is a follow-up.
- "Approve baseline" and "Export JUnit XML" buttons (visible in prototype, decorative in v1).
- Auth, user accounts, per-run permissions.
- Run-to-run comparison views, re-run triggers from the UI.
- Replacing the existing `scripts/report/render-html.js` pipeline. Dashboard ships in parallel.

## 3. Decisions (from brainstorming)

| Decision | Choice | Rationale |
|---|---|---|
| Project location | `apps/dashboard/` (monorepo style) | Sibling to `src/`, own `package.json`, room for future apps. |
| HTTP server | Tiny Express (`tsx` in dev, `node` in prod) | Control over `/api`, `/reports`, future server actions (re-run, approve). |
| v1 data source | Mock fixtures only, shape replicates `data.js` 1:1 | Validates UI and adapter contract before touching real pipeline. |
| Run discovery | Curated `reports/manifest.json` | Predictable; the pipeline (future) updates it on completion. |
| Run picker UX | Dropdown in topbar | Visible on every view; preserves layout from prototype. |
| Root route `/` | 302 redirect to most recent run | Standard for CI dashboards. Empty manifest → empty state. |
| PixelMatch images v1 | Real placeholder PNGs (1280×800, generated) | Exercises the server→`<img>` contract end-to-end. |
| Adapter execution | Server-side | Adapters can use Node `fs`; wire format is canonical `Tool`; browser stays small. |
| Reports location | Repo root `./reports/` (overridable via `REPORTS_DIR`) | Data is shared, not bound to the dashboard app. |

## 4. Architecture overview

```
Browser (Vite dev :5173 / static in prod)
   │  /api/* and /reports/* proxied to :8787 in dev
   ▼
Express server (:8787)
   ├── GET /api/runs                       → manifest.json
   ├── GET /api/runs/:runId                → { run, tools[] }  (summary)
   ├── GET /api/runs/:runId/tools/:toolId  → Tool              (full)
   ├── GET /reports/:runId/pixelmatch/*    → static PNGs
   ├── GET /assets/*                       → static logos
   └── GET /*                              → SPA fallback (index.html)
            │
            ▼ reads
    ./reports/manifest.json
    ./reports/<runId>/run.json
    ./reports/<runId>/<toolId>.json   ──→  ADAPTERS[toolId].adapter(raw, ctx) → Tool
    ./reports/<runId>/pixelmatch/*.png
```

The server is a thin orchestrator: it locates raw JSON on disk, runs the adapter registered for that `toolId`, and returns the canonical `Tool` shape. The client only ever sees normalized data.

## 5. Folder layout

```
apps/dashboard/
  package.json
  tsconfig.json
  tsconfig.server.json          # CommonJS build target for the server
  vite.config.ts                # proxy /api + /reports → http://localhost:8787
  index.html
  src/
    client/
      main.tsx
      App.tsx
      router.tsx                # React Router v6 routes
      api.ts                    # typed fetch helpers
      components/
        Topbar.tsx
        RunPicker.tsx           # dropdown in topbar
        HeroStrip.tsx
        ToolCard.tsx
        DetailHead.tsx
        KpiStrip.tsx
        FilterBar.tsx
        TestList.tsx
        PassFailDonut.tsx       # ported from charts.jsx
        Speedometer.tsx         # ported from charts.jsx
        DiffTriplet.tsx         # baseline / actual / diff <img> trio
        ToolLogo.tsx            # <img src="/assets/logos/{id}.svg"/> with fallback
      views/
        Overview.tsx
        NotFound.tsx
        EmptyManifest.tsx
        detail/
          GenericDetail.tsx     # web_ui + api
          MobileDetail.tsx      # mobile_ui (Android/iOS tabs)
          PerformanceDetail.tsx # performance (gauges + distribution + scenarios)
          VisualDetail.tsx      # visual (triplets)
      registry/
        tool-registry.ts        # kind → detail component
      styles/
        styles.css              # ported 1:1 from prototype
    server/
      index.ts                  # Express bootstrap
      routes/runs.ts
      runs-repo.ts              # filesystem access (manifest + per-run paths)
      normalize/
        index.ts                # ADAPTERS registry + dispatcher
        playwright.ts
        appium.ts
        api.ts
        gatling.ts
        pixelmatch.ts
        shared.ts               # count helpers, duration helpers, path resolvers
    shared/
      types.ts                  # Tool union, RunInfo, ManifestEntry, TestCase
      kinds.ts                  # ToolKind union
  public/assets/logos/
    playwright.svg appium.svg api.svg gatling.svg pixelmatch.svg
    platforms/android.svg platforms/ios.svg
  test/
    adapters/                   # vitest: one *.test.ts per adapter
    registry.test.ts            # registry completeness smoke test

reports/                        # repo root, NOT inside apps/dashboard/
  manifest.json
  <runId>/
    run.json
    playwright.json
    appium.json
    api.json
    gatling.json
    pixelmatch.json
    pixelmatch/
      <baseline>-baseline.png
      <baseline>-actual.png
      <baseline>-diff.png
```

## 6. Data model (TypeScript)

`src/shared/kinds.ts`:

```ts
export type ToolKind = 'web_ui' | 'mobile_ui' | 'api' | 'performance' | 'visual';
```

`src/shared/types.ts` — a discriminated union by `kind`:

```ts
export type Status = 'passed' | 'failed' | 'skipped';

export interface RunInfo {
  project: string;
  buildId: string;
  branch: string;
  commit: string;
  triggeredBy: string;
  startedAt: string;   // ISO or "YYYY-MM-DD HH:mm:ss"
  duration: string;    // human-readable, e.g. "27m 14s"
  env: string;
}

export interface ManifestEntry {
  runId: string;
  project: string;
  buildId: string;
  branch: string;
  startedAt: string;
}

export interface TestCase {
  name: string;
  suite: string;
  file: string;
  dur: string;
  status: Status;
  error?: string;
}

interface Counts {
  passed: number;
  failed: number;
  skipped: number;
  duration: string;
}

interface BaseTool extends Counts {
  id: string;
  name: string;
  description: string;
  suites?: string[];
}

export interface WebUiTool   extends BaseTool { kind: 'web_ui';   tests: TestCase[] }
export interface ApiTool     extends BaseTool { kind: 'api';      tests: TestCase[] }

export interface PlatformBlock extends Counts {
  device: string;
  suites: string[];
  tests: TestCase[];
}

export interface MobileUiTool extends BaseTool {
  kind: 'mobile_ui';
  platforms: { android: PlatformBlock; ios: PlatformBlock };
}

export interface PerfDistributionBucket { label: string; pct: number; count: number }
export interface PerfScenario { name: string; rps: number; p95: number; errors: number }

export interface PerformanceTool extends BaseTool {
  kind: 'performance';
  perf: {
    rps: number;
    avgMs: number;
    p95Ms: number;
    p99Ms: number;
    errorRate: number;
    requests: number;
    maxRps: number;
    distribution: PerfDistributionBucket[];
    scenarios: PerfScenario[];
  };
}

export interface VisualDiff {
  name: string;
  baseline: string;        // logical id, e.g. "pricing-hero"
  diffPct: number;
  status: 'passed' | 'failed';
  images: {
    baseline: string;      // URL: /reports/<runId>/pixelmatch/<baseline>-baseline.png
    actual: string;
    diff: string;
  };
}

export interface VisualTool extends BaseTool {
  kind: 'visual';
  diffs: VisualDiff[];
}

export type Tool = WebUiTool | ApiTool | MobileUiTool | PerformanceTool | VisualTool;

// The /api/runs/:runId endpoint returns tools without the heavy detail arrays.
// Each summary keeps id/name/kind/description/counts/duration/suites and drops
// tests[] (web_ui/api/mobile_ui), diffs[] (visual), and perf.scenarios[]/distribution[]
// (performance). The detail endpoint returns the full Tool.
export type ToolSummary =
  | Omit<WebUiTool,      'tests'>
  | Omit<ApiTool,        'tests'>
  | { kind: 'mobile_ui' } & Omit<MobileUiTool, 'platforms'> & {
      platforms: { android: Omit<PlatformBlock, 'tests'>; ios: Omit<PlatformBlock, 'tests'> };
    }
  | { kind: 'performance' } & Omit<PerformanceTool, 'perf'> & {
      perf: Omit<PerformanceTool['perf'], 'distribution' | 'scenarios'>;
    }
  | Omit<VisualTool, 'diffs'>;

export interface RunPayload {
  run: RunInfo;
  tools: ToolSummary[];
}
```

**Image URLs**: the pixelmatch adapter resolves baselines on disk into URLs at `/reports/<runId>/pixelmatch/<baseline>-{baseline,actual,diff}.png`. The client just renders `<img src={...}/>` — no fallback to procedural SVG (decision: real PNGs, missing image = visible error).

## 7. Tool-kind registry

**Server** (`src/server/normalize/index.ts`):

```ts
export type AdapterContext = {
  runId: string;
  runDir: string;
  runInfo: RunInfo;
};

export type Adapter = (raw: unknown, ctx: AdapterContext) => Tool | Promise<Tool>;

export const ADAPTERS: Record<string, { kind: ToolKind; adapter: Adapter }> = {
  playwright: { kind: 'web_ui',      adapter: playwrightAdapter },
  appium:     { kind: 'mobile_ui',   adapter: appiumAdapter },
  api:        { kind: 'api',         adapter: apiAdapter },
  gatling:    { kind: 'performance', adapter: gatlingAdapter },
  pixelmatch: { kind: 'visual',      adapter: pixelmatchAdapter },
};
```

**Client** (`src/client/registry/tool-registry.ts`):

```ts
export const DETAIL_BY_KIND: Record<ToolKind, ComponentType<{ tool: Tool }>> = {
  web_ui:      GenericDetail,
  api:         GenericDetail,
  mobile_ui:   MobileDetail,
  performance: PerformanceDetail,
  visual:      VisualDetail,
};

export const LOGO_PATH = (toolId: string) => `/assets/logos/${toolId}.svg`;
export const PLATFORM_LOGO = (p: 'android' | 'ios') => `/assets/logos/platforms/${p}.svg`;
```

**Adding Cypress later**: drop `cypress.svg`, add `playwright`-style entry to `ADAPTERS` with `kind: 'web_ui'`, write `cypressAdapter`. No UI changes.

## 8. Adapter contract

For v1 (mock fixtures), each adapter is a typed pass-through plus light enrichment (the pixelmatch adapter is the only one with real work — resolving image URLs):

```ts
export const playwrightAdapter: Adapter = (raw, ctx) => {
  const data = raw as WebUiTool;  // v1: fixture already matches Tool shape
  return { ...data, kind: 'web_ui', id: 'playwright' };
};
```

The pixelmatch adapter does the one real piece of work — resolving relative image URLs:

```ts
export const pixelmatchAdapter: Adapter = (raw, ctx) => {
  const data = raw as Omit<VisualTool, 'kind'>;
  return {
    ...data,
    kind: 'visual',
    diffs: data.diffs.map(d => ({
      ...d,
      images: {
        baseline: `/reports/${ctx.runId}/pixelmatch/${d.baseline}-baseline.png`,
        actual:   `/reports/${ctx.runId}/pixelmatch/${d.baseline}-actual.png`,
        diff:     `/reports/${ctx.runId}/pixelmatch/${d.baseline}-diff.png`,
      },
    })),
  };
};
```

Future real adapters will replace the bodies, keep the signature. Validation (zod, or hand-rolled) is recommended but not required in v1.

## 9. HTTP API

Express on `:8787` (configurable via `PORT`).

| Method | Path | Response |
|---|---|---|
| GET | `/api/runs` | `ManifestEntry[]` from `reports/manifest.json` (sorted by `startedAt` desc). |
| GET | `/api/runs/:runId` | `{ run: RunInfo, tools: ToolSummary[] }` — each tool with counts/duration but without per-test arrays. |
| GET | `/api/runs/:runId/tools/:toolId` | Full `Tool` (with `tests[]` / `diffs[]`). |
| GET | `/reports/:runId/pixelmatch/*` | Static PNGs (express.static, path-traversal-safe). |
| GET | `/assets/*` | Static from `public/assets/`. |
| GET | `*` (prod only) | `dist/index.html` (SPA fallback). |

**Path safety**: every filesystem access goes through `runs-repo.ts`, which does `path.resolve(REPORTS_DIR, runId, ...)` and asserts the resolved path starts with `REPORTS_DIR + path.sep`. Reject otherwise.

**Errors**:
- Unknown `runId` → 404 JSON `{ error: 'run_not_found', runId }`.
- Unknown `toolId` → 404 JSON `{ error: 'tool_not_found', toolId }`.
- Missing file when run is in manifest → 500 JSON `{ error: 'report_missing', file }`.
- Adapter throws → 500 JSON with the error message (no stack in response).

## 10. Routing (React Router v6)

```
/                            → loader: fetch /api/runs
                                 → if empty: <EmptyManifest/>
                                 → else: <Navigate to={`/runs/${runs[0].runId}`} replace/>
/runs                        → same as /
/runs/:runId                 → <Overview/>      (loader fetches /api/runs/:runId)
/runs/:runId/:toolId         → <ToolDetail/>    (loader fetches full tool)
                                 → renders DETAIL_BY_KIND[tool.kind]
*                            → <NotFound/> with link back to latest run
```

`<RunPicker>` is rendered inside `<Topbar/>` on every route. Changing the selection navigates to `/runs/{newId}{toolPath ?? ''}` so the currently-open tool stays open across run switches.

## 11. Dev workflow

Tooling: `vite` for the client; the npm package `tsx` (TypeScript executor — not the `.tsx` file extension) for running the Express server in dev with watch; `concurrently` to run both in one command.

`apps/dashboard/package.json` scripts:

```json
{
  "scripts": {
    "dev":      "concurrently -k -n vite,server -c blue,magenta \"vite\" \"tsx watch src/server/index.ts\"",
    "build":    "vite build && tsc -p tsconfig.server.json",
    "start":    "node dist/server/index.js",
    "test":     "vitest run",
    "test:watch":"vitest"
  }
}
```

`vite.config.ts` proxies `/api` and `/reports` to `http://localhost:8787`. Dev hits a single URL: `http://localhost:5173`.

Root `package.json` gets two convenience scripts:

```json
{ "scripts": {
    "dashboard":       "pnpm --filter dashboard dev",
    "dashboard:build": "pnpm --filter dashboard build"
}}
```

Pnpm workspaces (`pnpm-workspace.yaml`) — add `apps/*` if not present.

## 12. Fixtures (v1)

`reports/manifest.json` ships with **2 entries** to exercise the run-picker:

```json
[
  { "runId": "2026-05-24-build-4582", "project": "Acme Storefront", "buildId": "build-4582", "branch": "main",            "startedAt": "2026-05-24 09:42:11" },
  { "runId": "2026-05-23-build-4571", "project": "Acme Storefront", "buildId": "build-4571", "branch": "feat/cart-redesign","startedAt": "2026-05-23 16:08:02" }
]
```

Each `reports/<runId>/` contains:
- `run.json` — `RunInfo` (mirrors `RUN_INFO` from `data.js`).
- `playwright.json`, `appium.json`, `api.json`, `gatling.json` — the matching object from `TOOLS[]` in `data.js`, with `tests[]` taken from `SAMPLE_TESTS`.
- `pixelmatch.json` — like `data.js` but without the `images` field (the adapter fills it in).
- `pixelmatch/*.png` — 15 placeholder PNGs (5 baselines × {baseline, actual, diff}) generated via `sharp` at 1280×800. Baseline = solid color; actual = same color with a colored rectangle overlay; diff = high-contrast red overlay. Run 2 has the same screens with slightly different rectangle positions to make the `diffPct` numbers plausible.

A small script `apps/dashboard/scripts/generate-fixtures.ts` produces both runs deterministically (seeded). Commit the output PNGs.

## 13. Tests (Vitest)

- `test/adapters/*.test.ts` — one per adapter. Each loads its fixture JSON, runs the adapter, asserts the output is a valid `Tool` of the expected `kind` and (for pixelmatch) the image URLs resolve to the expected paths.
- `test/registry.test.ts` — asserts every `toolId` in `ADAPTERS` has a `DETAIL_BY_KIND[kind]` and a logo file under `public/assets/logos/`.
- No E2E. The UI is verified manually by running `pnpm dashboard` and clicking through both fixture runs.

## 14. Implementation order

1. **Scaffold** `apps/dashboard/` (package.json, tsconfig, vite, express bootstrap, empty React shell at `/`).
2. **Fixtures + manifest** — write the generator, produce `reports/` content.
3. **Server** — `/api/runs`, `/api/runs/:runId`, `/api/runs/:runId/tools/:toolId`, static routes.
4. **Playwright end-to-end** — port `data.js` types into `shared/types.ts`, write `playwrightAdapter`, write `GenericDetail`, `Overview`, `Topbar`, `RunPicker`, `ToolCard`, `HeroStrip`, `KpiStrip`, `FilterBar`, `TestList`, `PassFailDonut`. Verify Playwright card → detail flow works in browser with both runs.
5. **API tool** — re-uses `GenericDetail`. Validate registry indirection.
6. **Appium** — `MobileDetail` with platform tabs, second donut per platform.
7. **Gatling** — `PerformanceDetail` with `Speedometer` (ported from `charts.jsx`), distribution bars, scenarios list.
8. **PixelMatch** — `VisualDetail` with `DiffTriplet`, real `<img src>` against the generated PNGs.
9. **Tests** — adapter unit tests + registry smoke.
10. **Polish** — empty state at `/` when manifest is empty; 404 page; dev/build scripts on root `package.json`.

Each step ends with a working app the user can run with `pnpm dashboard`.

## 15. Risks / things to flag during implementation

- **OKLCH browser support** — Vite + modern Chrome/Firefox/Safari all support `oklch()`. Listed here so the implementer doesn't get surprised.
- **`sharp` on Windows** — the fixture generator. Has prebuilt binaries; should install cleanly on Node 22 + pnpm 11. If not, fall back to `pngjs` (slower but pure JS).
- **`concurrently` color codes in PowerShell** — should work; if Windows-only color quirks, drop the `-c` flag.
- **SPA fallback in prod** — Express must register `/api/*` and `/reports/*` BEFORE the catch-all `app.get('*', sendFile(index.html))`, or those endpoints get shadowed.
- **Path-traversal in `/reports/:runId/...`** — every fs access must go through `runs-repo.ts`'s resolver. This is the only attack surface in v1.

## 16. What changes when real adapters arrive (post-v1)

- Each adapter file's body is rewritten to read its tool's actual output format (Playwright JSON reporter, cucumber-json output, gatling `stats.json`, etc.).
- The CI pipeline writes one `<toolId>.json` per tool into a new `reports/<runId>/` directory and appends an entry to `manifest.json`.
- The wire format (`Tool` union) and all client code stay unchanged.
