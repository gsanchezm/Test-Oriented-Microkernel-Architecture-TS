# TOM Experimental Architecture

`architecture_type = TOM`. This document describes the components of the Test-Oriented Microkernel (TOM)
architecture as they are used in the experiments — what each component is, the role it plays, and how the
components compose into oracles. It describes the system as implemented; component names and ports are taken
directly from the source.

## 1. Component overview

TOM is a microkernel architecture for cross-platform test automation. A central kernel/proxy receives
tool-agnostic **intents** from the test suite and routes each one to the **plugin** that executes it with a
concrete tool. Tests express *what* to do (an intent plus a logical target); plugins decide *how* to do it with
a specific tool (Playwright, Appium, Gatling, …). The selection of which plugin runs a given UI intent is
controlled by the `DRIVER` environment variable, so the same features, routes, and action handlers run
unchanged across web and mobile tools.

| Component | Role | Port / location |
|---|---|---|
| Kernel / proxy | Intent routing, locator resolution, retry, overhead telemetry | TCP `50051` (`src/kernel/chaos-proxy.ts`) |
| Playwright plugin | Web UI intents | `50052` (`src/plugins/playwright/server.ts`) |
| Appium plugin | Mobile UI intents (legacy mobile tool) | `50053` (`src/plugins/appium/server.ts`) |
| Gatling plugin | Performance simulations | `50054` (`src/plugins/gatling/server.ts`) |
| API plugin | API contract execution / state injection | `50055` (`src/plugins/api/server.ts`) |
| Pixelmatch oracle | Visual comparison; **co-located in the Playwright process** | `50056` (in-process; not separately spawned) |
| Mobilewright plugin | Mobile UI intents via Playwright (tool-swap target for Appium) | `50057` (`src/plugins/mobilewright/server.ts`) |

There are six tools but only **five separately launched plugin processes**: the Pixelmatch visual oracle runs
inside the Playwright plugin process so it can read the active Playwright session in memory. Its port `50056`
stays free unless the oracle is enabled. Plugins are launched by `src/kernel/start-plugins.ts`, which reads the
registry in `plugins.config.ts` and starts each plugin whose `PLUGIN_<TOOL>` flag is enabled.

## 2. Kernel / proxy

The kernel/proxy (`src/kernel/chaos-proxy.ts`) is the single indirection boundary of the architecture. It
listens on TCP port `50051` and exposes one operation, `ExecuteIntent`, over gRPC.

Its responsibilities:

- **Intent routing.** Each request carries an `actionId` (a canonical intent ID from `src/kernel/intents.ts`,
  e.g. `CLICK`, `TYPE`, `NAVIGATE`), a target selector, and a platform string. The proxy extracts the tool
  name from the platform string and routes the call to that plugin's address (lazily dialing the plugin on
  first use). Plugin addresses are environment-configurable and default to `localhost:50052`–`50057`.
- **Locator resolution.** For UI intents the proxy resolves the logical locator key to a concrete,
  platform-specific selector before forwarding it, so features and routes never embed raw selectors.
  Pass-through intents (navigation, teardown, visual, API contract, performance) and mobile-via-Playwright
  intents bypass this resolution and forward their targets unchanged.
- **Transient-error handling.** Recognized transient errors (stale element, not-interactable, timeout, etc.)
  are retried with exponential backoff up to a fixed limit; deterministic errors fail fast.
- **Overhead telemetry.** For every intent the proxy emits a JSON record to **stdout** containing, among other
  fields, the total duration, the time spent inside the plugin, the inter-process latency
  (`grpc_or_ipc_latency_ms`), and the proxy's own indirection cost (`proxy_overhead_ms` — total duration minus
  plugin execution time). These per-intent records are the source for the architecture-specific overhead
  metrics; in CI the proxy stdout is captured to `logs/<tool>/proxy.log`. The proxy source itself is not
  modified by the metrics pipeline — the overhead is computed downstream from the captured log.

A locator cache is loaded once at proxy startup, so locator edits require restarting the proxy.

## 3. Plugins, action handlers, and registries

Each plugin is a small gRPC server (one per tool) that implements `ExecuteIntent`. A plugin owns:

- **A set of action handlers** under `src/plugins/<tool>/actions/`, each handler implementing one intent for
  that tool (for example, a `Click` handler for Playwright).
- **An action registry** (`register<Tool>Actions.ts`) that maps intent IDs to the tool's handlers. The proxy
  forwards an intent by name; the plugin's registry dispatches it to the matching handler. New capabilities are
  added by writing a handler and registering it — no change to the proxy, the intents, the features, or the
  routes.

Because plugin identity is the *tool*, two plugins can serve the same test type. The Appium and Mobilewright
plugins both execute mobile UI intents, which lets a project migrate from one mobile tool to another by
toggling which plugin is enabled, without touching features, routes, or action handlers.

### `DRIVER` selects the plugin per intent

The `DRIVER` environment variable chooses which plugin executes UI intents:

- `playwright` → web UI via Playwright
- `appium` → mobile UI via Appium
- `mobilewright` → mobile UI via Playwright
- `api` → UI interaction steps self-skip; only the API/data path runs

Per-domain routes (`src/core/tests/<domain>/*.route.ts`) read `DRIVER` to decide, step by step, whether a leg
runs through a UI plugin or through the API path. For instance, the checkout route fills delivery details over
the UI under `playwright`/`appium`/`mobilewright`, but submits the same accumulated state directly through the
API when `DRIVER=api`. Routes own this decision so step definitions stay thin and tool-agnostic.

## 4. Contracts

Contracts are the declarative inputs that decouple tests from tool- and platform-specific detail. TOM uses
three kinds:

- **Locator contracts** (`*.locators.json`) — map logical locator keys to concrete selectors. The proxy
  resolves logical keys against these at routing time. They are loaded and cached at proxy startup.
- **API contracts** — declarative endpoint definitions (request shape, expected response, assertions,
  extractions) executed by the API plugin.
- **Visual contracts** — declarative snapshot/region/threshold definitions consumed by the visual oracle.

Execution of API and visual contracts produces structured telemetry through the **contract telemetry writer**
(`src/core/contracts/contract-telemetry-writer.ts`), which appends one JSONL event per contract execution:

- API events → `metrics/raw/api/<runId>.jsonl`
- Visual events → `metrics/raw/visual/<runId>.jsonl`

The writer resolves the run id from `TOM_RUN_ID`, then `GITHUB_RUN_ID`, then a generated id, and hashes
sensitive request payloads (it never writes secrets). It is best-effort by default and fails hard only when
`TOM_TELEMETRY_STRICT=true`.

## 5. Telemetry

Telemetry is the objective record of execution behavior. Four streams feed the metrics pipeline:

| Stream | Source | Destination |
|---|---|---|
| Step / scenario events | step-level logger | `results/run-*/telemetry.jsonl` |
| API & visual contract events | contract telemetry writer | `metrics/raw/api/*.jsonl`, `metrics/raw/visual/*.jsonl` |
| Performance summary | Gatling plugin writer | `metrics/raw/gatling/<runId>/summary.json` |
| Per-intent proxy overhead | proxy stdout | `logs/<tool>/proxy.log` |

Downstream processors under `scripts/metrics/` read these streams (plus the Cucumber JSON reports and the
feature files) and produce deterministic CSVs under `metrics/processed/`, which the measurement scripts then
consume to compute the quality attributes. The metrics layer stamps `architecture_type = TOM` and the rest of
the experimental identity onto every output row using a per-job run manifest — the source emitters are not
modified.

## 6. Visual oracle

The visual oracle compares a freshly captured screenshot against a stored baseline. It is implemented with
**Pixelmatch** for pixel diffing and **PNGJS** for PNG decode/encode (`src/plugins/pixelmatch/support/`), and
it runs **co-located inside the Playwright plugin process** so it can read the active Playwright page directly
in memory rather than coordinating a separate browser session.

Key properties:

- **Baseline / comparison separation.** Capturing or refreshing a baseline is a distinct operation from
  comparing against it. Comparison runs never overwrite baselines; baseline updates happen only through the
  dedicated baseline-refresh path. This keeps a visual difference from silently becoming the new accepted
  state.
- **Result records.** Each comparison emits a visual contract telemetry event (baseline path, actual path, diff
  path, diff pixel count, diff ratio, threshold, pass/fail) to `metrics/raw/visual/`, which is normalized into
  `metrics/processed/visual_comparison_results.csv`.
- **Composable, not mandatory.** The visual oracle is an *additional* assertion layered onto a scenario, not a
  required step of any UI flow (see Section 8).

## 7. Performance oracle

The performance oracle runs load simulations with **Gatling**. Simulations are **spawned as subprocesses** and
run in the Gatling JVM bundle; the Gatling plugin orchestrates the run and parses the resulting report. The
plugin's performance telemetry writer (`src/plugins/gatling/actions/performance-telemetry-writer.ts`) writes a
single `summary.json` per run to `metrics/raw/gatling/<runId>/`, containing the simulation name, status,
duration, request/success/failure counts, and mean and p95 response times. This summary is normalized into
`metrics/processed/performance_summary.csv` and feeds the Performance Efficiency and Interoperability
attributes.

## 8. Composable oracles

TOM treats verification as a set of **composable oracles** rather than a single fixed assertion path. The
available oracles are:

- **API** — API contract execution and assertions (API plugin).
- **UI Web** — web UI interaction and assertions (Playwright plugin).
- **UI Mobile** — mobile UI interaction and assertions (Appium or Mobilewright plugin).
- **Visual Web** — pixel comparison of web screenshots (visual oracle in the Playwright process).
- **Visual Mobile** — pixel comparison of mobile screenshots.
- **Performance** — load simulation and threshold checks (Gatling plugin).

A scenario selects which oracles apply; they layer onto the same logical flow. Example compositions:

| Composition | What it verifies |
|---|---|
| API only | Backend behavior with no UI driver (`DRIVER=api`). |
| API → UI Web | API state injection sets up the scenario, then the web UI is exercised and asserted. |
| API → UI Mobile | Same, with the mobile UI as the interaction layer. |
| API → UI Web → Visual Web | The web flow runs and, additionally, key screens are pixel-compared against baselines. |
| UI Mobile → Visual Mobile | A mobile flow with an added visual assertion on rendered screens. |
| Performance | A load simulation against the same endpoints, independent of the UI oracles. |

The visual oracle is shown here as an example **composable dimension**: it is added to a web or mobile flow as
an extra assertion, and it is never a mandatory UI step. This composability — combined with the intent
abstraction and `DRIVER`-based plugin selection — is what lets one feature set be validated through different
combinations of heterogeneous tools, which the Interoperability attribute quantifies via the
`oracle_composition_count` and `successful_oracle_composition_count` metrics.
