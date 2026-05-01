# Test-Oriented Microkernel Architecture (TOM)

> **One Gherkin scenario, every layer.** Run the same `.feature` against Web (Playwright), Mobile (Appium), API, Visual snapshots and Gatling load tests through a single gRPC microkernel.

[![Node](https://img.shields.io/badge/node-22-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/typescript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![pnpm](https://img.shields.io/badge/pnpm-10-F69220?logo=pnpm&logoColor=white)](https://pnpm.io/)
[![License](https://img.shields.io/badge/license-ISC-blue.svg)](LICENSE)

---

## TL;DR

TOM is a test execution microkernel. Tests are written **once** in Gherkin and dispatched as `ExecuteIntent` gRPC calls to **isolated plugin servers** (`web-ui`, `mobile-ui`, `api`, `visual`, `performance`). The kernel (`chaos-proxy`) handles locator resolution, transient-failure retries, and telemetry — plugins are pure execution engines that don't know about test logic.

**Why care:** the same `Then the order is accepted` step runs against a Playwright browser, an Appium iOS device, or a Gatling load simulation **without modification**. Adding a new tool = a new plugin, not rewriting the suite.

The theoretical model behind it (Atomic Helix Model, π-Calculus, $\lambda < 0$ chaos suppression) lives at the bottom of this README — read it if you want, skip it if you just want the suite running.

## Quickstart (≤ 60 s)

```bash
nvm use && pnpm install                              # Node 22, see .nvmrc

# 3 terminals
pnpm run proxy                                       # microkernel  :50051
pnpm run plugins                                     # plugin servers from .env
pnpm test                                            # cucumber-js
```

Filter scenarios:

```bash
./node_modules/.bin/cucumber-js --tags "@smoke and not @wip"
./node_modules/.bin/cucumber-js src/core/tests/checkout/features/place-delivery-order.feature
```

> `pnpm test -- --name X` silently runs the **full** suite. Drop the `--` or call `cucumber-js` directly.

## How it flows

```
Cucumber step
  └─→ CheckoutRoute (orchestration + plugin selection)
        └─→ molecule (UI action wrapper)
              └─→ sendIntent(INTENT.CLICK, "loginButton")
                    └─→ chaos-proxy :50051
                          ├─ resolves logical key → platform selector
                          ├─ retries transient failures (StaleElement, Timeout, …)
                          └─ forwards to the right plugin server
                                ├─ web-ui      :50052   Playwright
                                ├─ mobile-ui   :50053   Appium
                                ├─ performance :50054   Gatling
                                ├─ api         :50055   fetch + HttpClient
                                └─ visual      :50056   pixelmatch
```

Five things to know:
1. **Steps are thin** — they just call route methods.
2. **Routes pick the plugin** — `DRIVER` env (`web-ui` / `mobile-ui` / `api`) decides whether `fillDelivery` runs in the browser or skips to API state injection.
3. **Action IDs are typed** — `INTENT.CLICK`, not raw strings. See [`src/kernel/intents.ts`](src/kernel/intents.ts).
4. **Each plugin owns its actions** — `src/plugins/<plugin>/actions/`. Adding an action = registering it; never touch the orchestrator.
5. **Locators are logical** — `streetInput`, not `[data-testid='street']`. Platform-specific selectors live in `*.locators.json` and are resolved by the proxy.

## Plugins

Plugins are named after the **type of test** they run, not the SDK they wrap:

| Plugin        | Tool          | Port   | What it does                                  |
|---------------|---------------|--------|-----------------------------------------------|
| `web-ui`      | Playwright    | 50052  | Browser automation, desktop + responsive       |
| `mobile-ui`   | Appium        | 50053  | iOS / Android via WebDriverIO                 |
| `performance` | Gatling       | 50054  | Load tests; subprocess runner + stats parser  |
| `api`         | fetch         | 50055  | Contract tests, $S_0$ state injection         |
| `visual`      | pixelmatch    | 50056  | Snapshot regression                           |

Toggle plugins with `PLUGIN_<NAME>=true|false` in `.env` and they hot-reload.

## Layers (Atomic-Helix)

| Layer     | Folder                        | Responsibility                                                             |
|-----------|-------------------------------|----------------------------------------------------------------------------|
| Atom      | `kernel/client.ts`            | `sendIntent()` — single gRPC primitive                                     |
| Molecule  | `[domain]/actions/*.molecule` | One UI action wrapped over `sendIntent`                                    |
| Route     | `[domain]/routes/*.route`     | Orchestrates molecules + DAOs; chooses plugin per intent                   |
| Step      | `[domain]/step_definitions/`  | Thin Gherkin binding — one line, calls a route method                      |
| DAO       | `[domain]/dao/`               | Direct API calls for `Given` state injection ($S_0$)                       |
| Resonance | `[domain]/simulations/`       | Gatling simulations co-located with the feature, driven by Examples table  |

Steps look like this:

```ts
Given('the OmniPizza user is logged in as {string}', async function (alias) {
    await route(this).loginAs(alias);
});
```

…all orchestration lives in [`CheckoutRoute`](src/core/tests/checkout/routes/checkout.route.ts).

## How to extend

| Goal                              | Where                                                              |
|-----------------------------------|--------------------------------------------------------------------|
| New action for an existing plugin | `src/plugins/<plugin>/actions/MyAction.ts` + register in `register<Plugin>Actions.ts` |
| New step                           | Add Gherkin in `*.feature`, bind in `step_definitions/`, delegate to a route method |
| New plugin                         | `src/plugins/<name>/{server.ts, <name>.ts, actions/}` + entry in `plugins.config.ts` |
| New intent ID                      | Add to `src/kernel/intents.ts` `INTENT` map; consumers use `INTENT.YOUR_ID` |

## Layout

```
src/
  proto/                           # gRPC service definition (ptom.proto)
  kernel/
    chaos-proxy.ts                 # microkernel — :50051
    client.ts                      # sendIntent() — typed by IntentAction
    intents.ts                     # INTENT catalog (single source of truth)
    locator-resolver.ts            # logical key → platform selector
    plugin-server.factory.ts       # gRPC boilerplate for plugins
  plugins/
    shared/                        # cross-plugin: ActionRegistry, ActionHandler, …
    web-ui/                        # Playwright; web-ui.ts + actions/
    mobile-ui/                     # Appium;     mobile-ui.ts + actions/ + appium-helpers.ts
    performance/                   # Gatling;    performance.ts + actions/ + support/
    api/                           # fetch HttpClient + actions/
    visual/                        # pixelmatch oracle + actions/
  core/
    test-data/                     # users.json, fixtures
    tests/
      login/dao/                   # login slice — currently API-only
      checkout/
        actions/                   # *.molecule.ts
        dao/                       # checkout.dao + checkout.types
        routes/                    # *.route.ts (Organisms)
        step_definitions/          # thin Gherkin bindings
        features/                  # *.feature
        contracts/                 # *.locators.json, api/visual contracts
        simulations/               # *.gatling.ts (JVM bundle, isolated)
  telemetry/                       # JSONL → MinIO
  utils/                           # pino logger
```

## Performance testing

Two modes that share the same simulation:

| Mode            | Trigger                                                    | When                                          |
|-----------------|------------------------------------------------------------|-----------------------------------------------|
| **Standalone**  | `pnpm perf:smoke|load|stress`                              | CI gates, HTML reports, manual investigation  |
| **TOM-driven**  | `sendIntent(INTENT.RUN_CHECKOUT_LOAD, 'smoke')`            | Triggering load from a Cucumber scenario      |

The feeder is **feature-driven** — `featureToCheckoutRows()` parses `place-delivery-order.feature` Examples at bundle time, so adding a row to the feature file automatically appears in the load run.

```bash
PERF_USERS=30 PERF_DURATION=60 pnpm perf:load
```

> First run downloads the Gatling JRE bundle (~200 MB). HTML reports land in `target/gatling/`.

The plugin returns a `SimulationMetrics` JSON in the gRPC payload — TOM-driven mode also fails the Cucumber step when the KO rate exceeds 1%.

## Environment

```bash
cp .env.example .env
```

### Core

| Variable        | Options                                       | Description                                       |
|-----------------|-----------------------------------------------|---------------------------------------------------|
| `PLATFORM`      | `web` `android` `ios` `api`                   | Target platform (drives locator resolution)       |
| `DRIVER`        | `web-ui` `mobile-ui` `api`                    | Picks which plugin runs UI intents                |
| `VIEWPORT`      | `desktop` `responsive`                        | Web only                                          |
| `BASE_URL`      | URL                                           | Web app under test                                |
| `API_BASE_URL`  | URL                                           | Backend for $S_0$ injection                       |
| `HEADLESS`      | `true` `false`                                |                                                   |
| `LOG_LEVEL`     | `fatal` `error` `warn` `info` `debug` `trace` | Pino level                                        |

### Plugin enable / addresses / ports

| Plugin enable          | Default | Address                                     | Listen port               |
|------------------------|---------|---------------------------------------------|---------------------------|
| `PLUGIN_WEB_UI`        | false   | `WEB_UI_ADDRESS=localhost:50052`            | `WEB_UI_PORT=50052`       |
| `PLUGIN_MOBILE_UI`     | false   | `MOBILE_UI_ADDRESS=localhost:50053`         | `MOBILE_UI_PORT=50053`    |
| `PLUGIN_PERFORMANCE`   | false   | `PERFORMANCE_ADDRESS=localhost:50054`       | `PERFORMANCE_PORT=50054`  |
| `PLUGIN_API`           | false   | `API_ADAPTER_ADDRESS=localhost:50055`       | `API_PLUGIN_PORT=50055`   |
| `PLUGIN_VISUAL`        | false   | `VISUAL_ADDRESS=localhost:50056`            | `VISUAL_PORT=50056`       |

`PROXY_ADDRESS=localhost:50051` is what `kernel/client.ts` uses to reach the proxy.

### Mobile (Appium HTTP server)

| Variable         | Default     | Description                                                                  |
|------------------|-------------|------------------------------------------------------------------------------|
| `APPIUM_HOST`    | `localhost` | Appium server host (the SDK, not the plugin)                                 |
| `APPIUM_PORT`    | `4723`      | Appium server port                                                           |
| `CAP_PROFILE`    | —           | JSON filename under `src/plugins/mobile-ui/capabilities/{android|ios}/`      |
| `ANDROID_APP_PATH` / `IOS_APP_PATH` | — | Path to APK / app bundle                                          |
| `IOS_UDID_<n>`   | `auto`      | Per-worker UDID for parallel iOS sims (`IOS_UDID_0`, `IOS_UDID_1`, …)        |

### Performance overrides

| Variable        | Default | Description                                            |
|-----------------|---------|--------------------------------------------------------|
| `PERF_PROFILE`  | smoke   | `smoke` / `load` / `stress`                            |
| `PERF_USERS`    | 20      | Ramp target (load) or burst size (stress)              |
| `PERF_DURATION` | 120     | Ramp duration in seconds (load only)                   |

## Cross-platform locators

```json
{
  "streetInput": {
    "web":    { "responsive": "[data-testid='address-responsive']", "desktop": "[data-testid='address-desktop']" },
    "mobile": { "android":    "android=new UiSelector().description(\"input-address\")", "ios": "~input-address" }
  }
}
```

Steps and molecules use logical keys (`streetInput`); the proxy resolves them based on `PLATFORM` + `VIEWPORT`. The same suite runs across all surfaces unchanged.

> **Restart the proxy** after editing `*.locators.json` — locators are cached at startup.

## Docker

```bash
docker compose up                              # web + api
docker compose --profile mobile up             # android emulator + appium + mobile-ui
docker compose --profile performance up        # standalone Gatling
```

The `mobile` profile chains: `android-emulator (docker-android)` → `appium-server` → `mobile-ui` plugin.

## CI / CD

| Workflow                    | Purpose                                                                  |
|-----------------------------|--------------------------------------------------------------------------|
| `ahm-execution-helix.yml`   | Unified test execution: api, web (desktop + responsive), android, ios, perf. Manual dispatch via `platform: all\|api\|web\|mobile\|android\|ios\|perf`. |
| `deploy-pages.yml`          | Static site deploy when `web/**` changes (GitHub Pages).                 |

The Helix workflow gates jobs by input — Android/iOS are manual-only because they need KVM + docker-android.

## Stack

| Concern             | Library                                            |
|---------------------|----------------------------------------------------|
| BDD framework        | @cucumber/cucumber                                |
| Language             | TypeScript (no build step — `ts-node` everywhere) |
| Aliases              | `tsconfig-paths` (`@kernel/*`, `@plugins/*`, …)   |
| Web automation       | playwright                                         |
| Mobile automation    | webdriverio + appium (UiAutomator2 / XCUITest)     |
| Performance          | @gatling.io/{core,http,cli}                        |
| Visual oracle        | pixelmatch + pngjs                                 |
| RPC                  | @grpc/grpc-js + @grpc/proto-loader                 |
| Logging              | pino + pino-pretty                                 |
| Telemetry storage    | minio                                              |
| Container            | docker + docker compose                            |

---

## Appendix: theoretical foundations

The architecture is grounded in three formal constraints that distinguish it from heuristic test-strategy metaphors (Test Pyramid, Trophy, Honeycomb). You don't need any of this to use the suite — but it explains *why* the suite is shaped the way it is.

### Atomic Helix Model (AHM)

AHM defines *how tests execute* through formal constraints rather than prescribing *how much* to test at each layer:

- **Set Theory isolation** — $S_{A1} \cap S_{A2} = \emptyset$. Each scenario operates on a disjoint state set; cross-test contamination is a definitional impossibility, not a discipline problem.
- **π-Calculus message passing** — every cross-process communication is a typed gRPC intent. No shared memory, no global state mutation between layers.
- **Chaos Suppression** — Lyapunov exponent $\lambda < 0$. The proxy detects transient failures (stale elements, network jitter, detached nodes) and absorbs them via exponential backoff. Deterministic failures fail immediately without retry.

### Layer mapping

| AHM layer          | Implementation                                                                                                                |
|--------------------|-------------------------------------------------------------------------------------------------------------------------------|
| ⚛️ Atoms           | `kernel/client.ts` — `sendIntent()` indivisible primitives                                                                    |
| 🧬 Molecules       | `[domain]/actions/` — grouped intents, cross-platform                                                                         |
| 🦠 Organisms       | `[domain]/routes/` — orchestrate molecules, decide which plugin to call                                                       |
| 🌍 Eco-Systems     | `[domain]/features/` + `step_definitions/` — BDD scenarios, thin bindings                                                     |
| 🌊 Resonance       | `[domain]/simulations/` — Gatling load simulations driven by the same Examples table                                          |
| 🌀 Execution Helix | `.github/workflows/` — CI/CD pipelines uniting all layers into parallel, isolated orbits governed by mathematical constraints |

### Adapting other test categories

- **Visual / accessibility** — map onto Molecules: a snapshot check is a `COMPARE_SNAPSHOT` intent. The visual plugin owns the oracle.
- **DAST** — fits into Resonance. Same feeder mechanics as load tests, payload becomes the attack surface.
- **SAST** — outside the AHM kernel. Static analysis doesn't carry stochastic noise, so $\lambda < 0$ doesn't apply. Runs as a regular CI job.
- **Unit tests** — outside the kernel. They evaluate code locally, no network jitter; should live alongside source code.

### Performance: TOM-driven vs standalone

Both modes run the same `checkout-load.gatling.ts` simulation. The difference is provenance:

- **Standalone** — Gatling CLI invokes the simulation directly. Used for CI gates, HTML reports, and manual capacity planning.
- **TOM-driven** — a Cucumber step issues `INTENT.RUN_CHECKOUT_LOAD`; the `performance` plugin spawns Gatling as a subprocess, parses `target/gatling/<report>/js/stats.json`, and returns `SimulationMetrics` in the gRPC `payload`. PASS when KO rate < 1%, FAIL otherwise (which propagates to the Cucumber step).

### JVM boundary

`@gatling.io/core` and `@gatling.io/http` call `Java.type()` at module load and only work inside the Gatling JVM bundle. They must **never** be imported from `src/plugins/performance/performance.ts` or any handler running in the Node plugin server. Simulations are spawned as subprocesses; the plugin server only orchestrates and parses results.

Files under `src/core/tests/checkout/simulations/**` keep relative imports — `@gatling.io/cli` bundles them with esbuild, which doesn't honor `tsconfig.paths`.
