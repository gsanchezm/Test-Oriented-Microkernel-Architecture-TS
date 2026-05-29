# Test-Oriented Microkernel Architecture (TOM)

> **One Gherkin scenario, every layer.** Run the same `.feature` against Web (Playwright), Mobile (Appium), API, Visual snapshots and Gatling load tests through a single gRPC microkernel.

[![Node](https://img.shields.io/badge/node-22-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/typescript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![pnpm](https://img.shields.io/badge/pnpm-10-F69220?logo=pnpm&logoColor=white)](https://pnpm.io/)
[![License](https://img.shields.io/badge/license-ISC-blue.svg)](LICENSE)

---

## TL;DR

TOM is a test execution microkernel. Tests are written **once** in Gherkin and dispatched as `ExecuteIntent` gRPC calls to **isolated plugin servers** (`playwright`, `appium`, `mobilewright`, `gatling`, `api`, `pixelmatch`). The kernel (`chaos-proxy`) handles locator resolution, transient-failure retries, and telemetry — plugins are pure execution engines that don't know about test logic.

**Why care:** the same `Then the order is accepted` step runs against a Playwright browser, an Appium iOS device, or a Gatling load simulation **without modification**. Adding a new tool = a new plugin, not rewriting the suite — and because plugin identity = the tool, you can run a legacy plugin (`appium`) side-by-side with a migration target (`mobilewright`) and switch by toggling one env var.

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
                                ├─ playwright  :50052   Web UI
                                ├─ appium      :50053   Mobile UI (legacy)
                                ├─ gatling     :50054   Load / performance
                                ├─ api         :50055   fetch + HttpClient
                                ├─ pixelmatch  :50056   Visual oracle
                                └─ mobilewright:50057   Mobile UI (Playwright)
```

Five things to know:
1. **Steps are thin** — they just call route methods.
2. **Routes pick the plugin** — `DRIVER` env (`playwright` / `appium` / `api`) decides whether `fillDelivery` runs in the browser or skips to API state injection.
3. **Action IDs are typed** — `INTENT.CLICK`, not raw strings. See [`src/kernel/intents.ts`](src/kernel/intents.ts).
4. **Each plugin owns its actions** — `src/plugins/<plugin>/actions/`. Adding an action = registering it; never touch the orchestrator.
5. **Locators are logical** — `streetInput`, not `[data-testid='street']`. Platform-specific selectors live in `*.locators.json` and are resolved by the proxy.

## Plugins

Plugin identity = **the tool under the hood**. Two plugins can serve the same test type (`appium` and `mobilewright` both run mobile intents), so a project migrates between tools by toggling `PLUGIN_*` — features, routes, and action handlers don't change.

| Plugin         | Wraps            | Port   | What it does                                       |
|----------------|------------------|--------|----------------------------------------------------|
| `playwright`   | Playwright       | 50052  | Web UI: desktop + responsive                       |
| `appium`       | Appium + WdIO    | 50053  | Mobile UI on iOS / Android (legacy path)           |
| `mobilewright` | Playwright       | 50057  | Mobile UI via Playwright (migration target)        |
| `gatling`      | Gatling          | 50054  | Load tests; subprocess runner + stats parser       |
| `api`          | fetch            | 50055  | Contract tests, $S_0$ state injection              |
| `pixelmatch`   | pixelmatch+pngjs | 50056  | Visual oracle / snapshot regression                |

Toggle plugins with `PLUGIN_<TOOL>=true|false` in `.env` and they hot-reload.

## Layers (Atomic-Helix)

| Layer            | Folder                                                | Responsibility                                                                                        |
|------------------|-------------------------------------------------------|-------------------------------------------------------------------------------------------------------|
| Atoms            | `kernel/client.ts`                                    | `sendIntent()` — the single, indivisible gRPC primitive                                               |
| Molecules        | `[domain]/molecules/*.molecule`                       | Grouped atomic intents — one cross-platform UI action wrapped over `sendIntent`                       |
| Organisms        | `[domain]/organisms/*.route`                          | Orchestrate molecules + DAOs into business flows; choose the plugin per intent                        |
| Eco-Systems      | `[domain]/features/` + `step_definitions/` (+ `dao/`) | BDD scenarios composing use cases + DAOs — steps are thin one-line bindings; DAOs do `Given` $S_0$ state injection |
| Resonance        | `[domain]/resonance/`                                 | Gatling simulations co-located with the feature, driven by the same Examples table                    |
| Execution Helix  | `.github/workflows/`                                  | CI/CD uniting every layer into parallel, isolated orbits (`ahm-execution-helix.yml`)                  |

Steps look like this:

```ts
Given('the OmniPizza user is logged in as {string}', async function (alias) {
    await route(this).loginAs(alias);
});
```

…all orchestration lives in [`CheckoutRoute`](src/core/tests/checkout/organisms/checkout.route.ts).

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
    playwright/                    # Playwright (web UI)
    appium/                        # Appium + WebdriverIO (mobile UI, legacy)
    mobilewright/                  # Playwright on mobile (migration target)
    gatling/                       # Gatling subprocess runner + actions/ + support/
    api/                           # fetch HttpClient + actions/
    pixelmatch/                    # Visual oracle (pixelmatch + pngjs)
  core/
    test-data/                     # users.json, fixtures
    tests/
      <domain>/                    # one slice per domain: login, checkout, catalog, pizzaBuilder, navbar, order_success, …
        molecules/                 # *.molecule.ts        (Molecules)
        organisms/                 # *.route.ts           (Organisms)
        step_definitions/          # *.steps.ts + visual.hooks.ts — thin Gherkin bindings (Eco-Systems)
        features/                  # *.feature            (Eco-Systems)
        dao/                       # *.dao.ts + *.types.ts — Given $S_0$ state injection
        contracts/                 # *.locators.json, api/visual contracts
        resonance/                 # *.gatling.ts (JVM bundle, isolated) (Resonance)
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
| `DRIVER`        | `playwright` `appium` `api`                    | Picks which plugin runs UI intents                |
| `VIEWPORT`      | `desktop` `responsive`                        | Web only                                          |
| `BASE_URL`      | URL                                           | Web app under test                                |
| `API_BASE_URL`  | URL                                           | Backend for $S_0$ injection                       |
| `HEADLESS`      | `true` `false`                                |                                                   |
| `LOG_LEVEL`     | `fatal` `error` `warn` `info` `debug` `trace` | Pino level                                        |

### Plugin enable / addresses / ports

| Plugin enable          | Default | Address                                     | Listen port               |
|------------------------|---------|---------------------------------------------|---------------------------|
| `PLUGIN_PLAYWRIGHT`        | false   | `PLAYWRIGHT_ADDRESS=localhost:50052`            | `PLAYWRIGHT_PLUGIN_PORT=50052`       |
| `PLUGIN_APPIUM`     | false   | `APPIUM_ADDRESS=localhost:50053`         | `APPIUM_PLUGIN_PORT=50053`    |
| `PLUGIN_GATLING`   | false   | `GATLING_ADDRESS=localhost:50054`       | `GATLING_PLUGIN_PORT=50054`  |
| `PLUGIN_API`           | false   | `API_ADAPTER_ADDRESS=localhost:50055`       | `API_PLUGIN_PORT=50055`   |
| `PLUGIN_PIXELMATCH`        | false   | `PIXELMATCH_ADDRESS=localhost:50056`            | `PIXELMATCH_PLUGIN_PORT=50056`       |

`PROXY_ADDRESS=localhost:50051` is what `kernel/client.ts` uses to reach the proxy.

### Mobile (Appium HTTP server)

| Variable         | Default     | Description                                                                  |
|------------------|-------------|------------------------------------------------------------------------------|
| `APPIUM_HOST`    | `localhost` | Appium server host (the SDK, not the plugin)                                 |
| `APPIUM_PORT`    | `4723`      | Appium server port                                                           |
| `CAP_PROFILE`    | —           | JSON filename under `src/plugins/appium/capabilities/{android|ios}/`      |
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
docker compose --profile mobile up             # android emulator + appium daemon + appium plugin
docker compose --profile performance up        # standalone Gatling
```

The `mobile` profile chains: `android-emulator (docker-android)` → `appium-server` → `appium` plugin.

## CI / CD

| Workflow                    | Purpose                                                                  |
|-----------------------------|--------------------------------------------------------------------------|
| `ahm-execution-helix.yml`   | Unified test execution: api, web (desktop + responsive), android, ios, perf. Manual dispatch via `platform: all\|api\|web\|mobile\|android\|ios\|perf`. |
| `deploy-pages.yml`          | Static site deploy when `web/**` changes (GitHub Pages).                 |

The Helix workflow gates jobs by the `platform` input on manual dispatch. **On `push`/`pull_request` to `main`, every job runs** — including `e2e-android` (KVM + docker-android) and `e2e-ios` (`macos-latest`) — because each gate's `if` is `github.event_name != 'workflow_dispatch' || inputs.platform == …`, and the first operand is already `true` for push/PR. A published OmniPizza release is therefore a prerequisite for *all* event-triggered runs, not only mobile dispatches. (If you want mobile to be manual-only, the gate `if:` blocks must be tightened to `github.event_name == 'workflow_dispatch' && …`.)

Each job is named after the **tool** that executes it (`Playwright`, `Appium`, `Gatling`, `Pixelmatch`) rather than the platform — consistent with the *plugin identity = the tool* principle, so a status check names exactly which engine ran. The job **keys** (`e2e-web`, `e2e-android`, …) are unchanged, so `needs:` wiring and the `update-visual-baselines.yml` references stay intact; only the display names shift. If branch protection requires checks by their old display name, update those required checks in repo settings.

### Before you run `ahm-execution-helix.yml`

The workflow assumes a few things already exist in the repo. Set these up **once**, then trigger runs freely.

**1. Repository secrets** — _Settings → Secrets and variables → Actions → Secrets_:

| Secret          | Needed by                                                        | Notes                                                            |
|-----------------|------------------------------------------------------------------|------------------------------------------------------------------|
| `API_BASE_URL`  | **every** job (api, web, responsive, visual, android, ios, perf) | Backend used for `$S_0$` state injection.                        |
| `BASE_URL`      | web + visual jobs only (`e2e-web*`, `visual-web*`)               | Frontend under test. Not read by api/mobile/perf jobs.           |
| `GITHUB_TOKEN`  | `resolve-omnipizza-release`                                      | **Automatic** — GitHub injects it. No setup needed.              |

**2. Repository variables** — _Settings → Secrets and variables → Actions → Variables_:

| Variable          | Needed by                          | Notes                                                                        |
|-------------------|------------------------------------|------------------------------------------------------------------------------|
| `IOS_APP_PATH`    | `e2e-ios` (optional)               | Overrides the auto-discovered `.app` bundle path. Omit to auto-discover.     |
| `VISUAL_BASE_URL` | `update-visual-baselines.yml` only | The baseline-refresh workflow reads this as its `BASE_URL`. Required to seed baselines (step 4). |

**3. OmniPizza release must be published** (`gsanchezm/OmniPizza`) — required because mobile runs on every push/PR (see note above):

- The repo's `releases/latest` must exist with assets named **exactly** `omnipizza-release.apk` (Android) and `OmniPizza-Simulator.zip` (iOS). The resolver job reads `tag_name` from `/releases/latest`; the mobile jobs download `<base_url>/<asset>`.
- `gsanchezm/OmniPizza` must be **public** — the API query sends a `GITHUB_TOKEN` Bearer (scoped to *this* repo only), but the asset download uses an unauthenticated `curl -fL`. For a private OmniPizza you'd need to supply a PAT secret and add `-H "Authorization"` to the download.

**4. Seed visual baselines (recommended, not mandatory):**

- The `Visual gate` step does **not** fail on missing baselines — a snapshot with no baseline is *bootstrapped* (created on the fly, counted as `bootstrapped`, status ≠ `FAIL`). So a first run won't go red just because `visual-baselines/` is empty.
- But bootstrapped baselines are ephemeral (per-run). For meaningful drift detection, seed canonical baselines first by dispatching **`update-visual-baselines.yml`** (requires `VISUAL_BASE_URL` from step 2):

  ```bash
  gh workflow run update-visual-baselines.yml -f reason="seed initial baselines"
  # optional: -f target_branch=main
  ```

  It wipes `visual-baselines/*.png`, regenerates them in the pinned `playwright:v1.58.2-jammy` Linux container, `git add -f`'s them, and opens a PR. **Merge that PR** so the canonical PNGs land in git. Thereafter the helix `Visual gate` compares against them.

**5. Dispatch the workflow** — _Actions → "AHM — Execution Helix" → Run workflow_, or via CLI:

```bash
gh workflow run ahm-execution-helix.yml -f platform=web
gh workflow run ahm-execution-helix.yml -f platform=perf -f perf_profile=load -f perf_users=30 -f perf_duration=60
gh workflow run ahm-execution-helix.yml -f platform=mobile -f android_api_level=33
```

**What each `platform` choice needs** (push/PR ⇒ `all`):

| `platform` | Requires                                                                 | Dispatch inputs honored                                  |
|------------|--------------------------------------------------------------------------|----------------------------------------------------------|
| `api`      | `API_BASE_URL`                                                           | —                                                        |
| `web`      | `API_BASE_URL` + `BASE_URL` (+ baselines recommended for the visual sub-jobs) | —                                                   |
| `android`  | `API_BASE_URL` + OmniPizza release (`omnipizza-release.apk`)             | `android_api_level`                                      |
| `ios`      | `API_BASE_URL` + OmniPizza release (`OmniPizza-Simulator.zip`) + `IOS_APP_PATH` (optional) | —                                      |
| `mobile`   | both android + ios prerequisites                                         | `android_api_level`                                      |
| `perf`     | `API_BASE_URL`                                                           | `perf_profile`, `perf_users`, `perf_duration`            |
| `all`      | all of the above                                                         | all of the above                                         |

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
| 🧬 Molecules       | `[domain]/molecules/` — grouped intents, cross-platform                                                                         |
| 🦠 Organisms       | `[domain]/organisms/` — orchestrate molecules, decide which plugin to call                                                       |
| 🌍 Eco-Systems     | `[domain]/features/` + `step_definitions/` — BDD scenarios, thin bindings                                                     |
| 🌊 Resonance       | `[domain]/resonance/` — Gatling load simulations driven by the same Examples table                                          |
| 🌀 Execution Helix | `.github/workflows/` — CI/CD pipelines uniting all layers into parallel, isolated orbits governed by mathematical constraints |

### Adapting other test categories

- **Visual / accessibility** — map onto Molecules: a snapshot check is a `COMPARE_SNAPSHOT` intent. The `pixelmatch` plugin owns the oracle. Visual snapshots are **a dimension of the web Eco-System**, not a separate pipeline: the same Cucumber scenarios that drive functional checks fire visual hooks when tagged `@visual` and `PLUGIN_PIXELMATCH=true`. The CI gate (`scripts/visual-gate.js`) surfaces drift as an independent failure so functional and visual regressions remain separately diagnosable.
- **DAST** — fits into Resonance. Same feeder mechanics as load tests, payload becomes the attack surface.
- **SAST** — outside the AHM kernel. Static analysis doesn't carry stochastic noise, so $\lambda < 0$ doesn't apply. Runs as a regular CI job.
- **Unit tests** — outside the kernel. They evaluate code locally, no network jitter; should live alongside source code.

### Visual oracle: baselines + bucketing + threshold

Three design decisions worth knowing before authoring or extending visual snapshots:

- **Baselines live in `visual-baselines/` (tracked) but PNGs are gitignored locally** (`.gitignore: visual-baselines/*` + `!visual-baselines/.gitkeep`). Canonical baselines come exclusively from the `update-visual-baselines.yml` workflow which runs in the Playwright-jammy container and `git add -f`'s the PNGs into a PR. Locally, `pnpm visual:refresh` regenerates baselines for iteration, but those stay invisible to git so dev fonts (Windows ClearType, macOS subpixel) never pollute the committed Linux-rendered set.
- **Snapshot keys bucket by `<feature>/<snapshotId>/<platform>/<viewport>/[<market>/][<language>/]`.** The market and language segments are optional and propagate from `world.orderContext`/`world.locale`/`world.languageOverride` through the visual hook's options JSON. Two scenarios with the same market but different language land on different baselines — the right granularity for i18n testing.
- **Threshold policy is OR-logic.** A snapshot passes if either `pixelRatio` OR `pixelCount` is satisfied. Defaults are zero for both (strict equality if the contract says nothing). The previous AND behavior silently vetoed a satisfied dimension if the other defaulted to zero — a `pixelRatio: 0.01` declaration is now respected on its own.

To accept a legitimate UI change: trigger `update-visual-baselines.yml` workflow_dispatch with a `reason`, review the resulting PR, merge. The next PR's `e2e-web` Visual gate goes green automatically.

### Performance: TOM-driven vs standalone

Both modes run the same `checkout-load.gatling.ts` simulation. The difference is provenance:

- **Standalone** — Gatling CLI invokes the simulation directly. Used for CI gates, HTML reports, and manual capacity planning.
- **TOM-driven** — a Cucumber step issues `INTENT.RUN_CHECKOUT_LOAD`; the `gatling` plugin spawns Gatling as a subprocess, parses `target/gatling/<report>/js/stats.json`, and returns `SimulationMetrics` in the gRPC `payload`. PASS when KO rate < 1%, FAIL otherwise (which propagates to the Cucumber step).

### JVM boundary

`@gatling.io/core` and `@gatling.io/http` call `Java.type()` at module load and only work inside the Gatling JVM bundle. They must **never** be imported from `src/plugins/gatling/gatling.ts` or any handler running in the Node plugin server. Simulations are spawned as subprocesses; the plugin server only orchestrates and parses results.

Files under `src/core/tests/checkout/resonance/**` keep relative imports — `@gatling.io/cli` bundles them with esbuild, which doesn't honor `tsconfig.paths`.
