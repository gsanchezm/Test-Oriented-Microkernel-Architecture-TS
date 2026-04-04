# AHM-POC: Atomic Helix Model

A cross-platform E2E testing framework built on a **Testing Oriented Microkernel (TOM)** architecture. Tests are written once in Gherkin and executed across Web (Playwright), Mobile (Appium), API, and Performance (Gatling) through isolated gRPC plugin servers.

## Architecture

```
Cucumber Steps --> client.ts --> chaos-proxy (:50051) --> plugin servers
                                    |                       |-- playwright (:50052)
                                    |                       |-- appium     (:50053)
                                    |                       |-- gatling    (:50054)
                                    |                       |-- api        (:50055)
                                    |
                                    +-- locator resolution
                                    +-- chaos suppression (Lyapunov stabilizer)
                                    +-- telemetry emission
```

The **Microkernel** (`chaos-proxy`) receives generic `ExecuteIntent` gRPC calls, resolves logical locator keys to platform-specific selectors, applies exponential backoff for transient failures, and forwards the intent to the appropriate plugin server.

## Atomic Design Layers

| AHM Layer | Folder | Purpose |
|-----------|--------|---------|
| Atoms | `kernel/client.ts` | `sendIntent()` — indivisible gRPC primitives |
| Molecules | `[domain]/actions/` | Grouped atomic intents (cross-platform reusable) |
| Organisms | `[domain]/usecases/` | Orchestrate actions into business flows |
| Eco-Systems | `[domain]/features/` + `step_definitions/` | BDD scenarios composing use cases + DAOs |

## Project Structure

```
src/
  proto/                   # gRPC service definitions (ptom.proto)
  kernel/                  # Microkernel: proxy, client, locator resolver, plugin factory, launcher
  plugins/                 # Isolated gRPC plugin servers
    playwright/            #   Web automation (Chromium)
    appium/                #   Mobile automation (Android / iOS)
    gatling/               #   Performance testing (@gatling.io TS DSL)
    api/                   #   API testing (HttpClient)
  core/
    test-data/             # Data sources (users.json, etc.)
    tests/
      [domain]/            # e.g. 'checkout'
        actions/           # Molecules: reusable cross-platform action wrappers
        usecases/          # Organisms: business flow orchestration
        features/          # Eco-Systems: BDD scenarios (.feature files)
        step_definitions/  # Thin Gherkin bindings → use cases + DAOs
        locators/          # JSON mapping logical keys to platform selectors
        dao/               # API state injection ($S_0$)
  utils/                   # Shared utilities (pino logger)

plugins.config.ts          # Plugin registry — enable/disable plugins
.env                       # Local environment configuration (gitignored)
.env.example               # Template for environment configuration
```

## Prerequisites

- Node.js 22 LTS (see `.nvmrc`)
- pnpm 10.29.x

```bash
nvm use        # switches to Node 22 from .nvmrc
pnpm install
```

## Running Tests (Local)

### Option A — Plugin launcher (recommended)

Enable the plugins you need in `.env`, then start everything with two terminals:

```bash
# Terminal 1: Start the microkernel proxy
pnpm run proxy

# Terminal 2: Start all enabled plugins (controlled by .env)
pnpm run plugins

# Terminal 3: Run tests
pnpm test
```

Plugins are toggled in `.env`:

```env
PLUGIN_PLAYWRIGHT=true
PLUGIN_APPIUM=false
PLUGIN_API=true
PLUGIN_GATLING=false
```

### Option B — Start plugins individually

```bash
pnpm run plugin:playwright   # Web
pnpm run plugin:appium       # Mobile
pnpm run plugin:api          # API
pnpm run plugin:gatling      # Performance
```

### With Docker

```bash
# Web + API (default)
docker compose up

# Android (emulator via docker-android + Appium server)
docker compose --profile mobile up

# Performance testing
docker compose --profile performance up
```

### Android emulator (docker-android)

The `mobile` profile starts three services in order:

```
android-emulator  →  appium-server  →  appium-plugin
(docker-android)     (Appium 2.x)      (gRPC plugin)
```

`android-emulator` uses [`halimqarroum/docker-android`](https://github.com/HQarroum/docker-android) and requires KVM on Linux. On macOS you can run the emulator natively instead and point `APPIUM_HOST=localhost`.

**Required env vars for mobile:**

| Variable | Default | Description |
|----------|---------|-------------|
| `ANDROID_API_LEVEL` | `34` | Android API level (`28`–`34`) |
| `ANDROID_IMG_TYPE` | `google_apis` | `google_apis` or `google_apis_playstore` |
| `ANDROID_DEVICE_ID` | `pixel` | AVD device profile |
| `ANDROID_EMULATOR_MEMORY` | `4096` | RAM in MB |
| `ANDROID_EMULATOR_CORES` | `2` | vCPU count |
| `ANDROID_APP_PATH` | — | Path to `.apk` under test |

## Environment Configuration

Copy `.env.example` to `.env` and fill in the values:

```bash
cp .env.example .env
```

### Key variables

| Variable | Options | Description |
|----------|---------|-------------|
| `PLATFORM` | `web` `android` `ios` `api` | Target platform |
| `VIEWPORT` | `desktop` `responsive` | Web viewport (only when `PLATFORM=web`) |
| `DRIVER` | `playwright` `appium` `api` | Automation driver |
| `BASE_URL` | URL | Web application under test |
| `API_BASE_URL` | URL | Backend API for state injection |
| `HEADLESS` | `true` `false` | Browser visibility |
| `LOG_LEVEL` | `fatal` `error` `warn` `info` `debug` `trace` | Pino log level |

### Plugin addresses (proxy → plugins)

| Variable | Default | Description |
|----------|---------|-------------|
| `PROXY_ADDRESS` | `localhost:50051` | Used by `client.ts` to reach the proxy |
| `PLAYWRIGHT_ADDRESS` | `localhost:50052` | Used by proxy to reach Playwright plugin |
| `APPIUM_ADDRESS` | `localhost:50053` | Used by proxy to reach Appium plugin |
| `GATLING_ADDRESS` | `localhost:50054` | Used by proxy to reach Gatling plugin |
| `API_ADAPTER_ADDRESS` | `localhost:50055` | Used by proxy to reach API plugin |

### Plugin listen ports (each plugin server)

| Variable | Default | Description |
|----------|---------|-------------|
| `PLAYWRIGHT_PORT` | `50052` | Port the Playwright plugin binds to |
| `APPIUM_PORT_GRPC` | `50053` | Port the Appium plugin binds to |
| `API_PLUGIN_PORT` | `50055` | Port the API plugin binds to |
| `GATLING_PLUGIN_PORT` | `50054` | Port the Gatling plugin binds to |

### Appium (mobile only)

| Variable | Default | Description |
|----------|---------|-------------|
| `APPIUM_HOST` | `localhost` | Appium server host |
| `APPIUM_PORT` | `4723` | Appium server port |
| `ANDROID_APP_PATH` | — | Path to `.apk` under test |
| `IOS_APP_PATH` | — | Path to `.zip` under test |
| `IOS_UDID` | `auto` | iOS device UDID |

## Cross-Platform Locators

Locator JSON files map logical keys to platform-specific selectors. The proxy resolves them at runtime based on `PLATFORM` and `VIEWPORT`:

```json
{
  "streetInput": {
    "web": {
      "responsive": "[data-testid='address-responsive']",
      "desktop": "[data-testid='address-desktop']"
    },
    "mobile": {
      "android": "android=new UiSelector().description(\"input-address\")",
      "ios": "~input-address"
    }
  }
}
```

Actions always use logical keys (`streetInput`), never raw selectors. The same test code runs across all platforms without modification.

## Key Concepts

### Chaos Suppression
The proxy detects transient failures (stale elements, timeouts, detached nodes) and automatically retries with exponential backoff. Deterministic failures fail immediately without retrying.

### API State Injection ($S_0$)
`Given` steps inject test state directly via API calls using DAOs, bypassing flaky UI setup flows. Login, cart creation, and market selection happen through `HttpClient`. `When`/`Then` steps then attach to this pre-built state via the UI.

### Browser Session Isolation
Each Cucumber worker gets its own `BrowserContext` in Playwright. `localStorage` is cleared between scenarios so state never leaks across scenario outlines.

### Plugin Isolation
Each plugin runs as an independent gRPC server. The proxy handles locator resolution, chaos suppression, and telemetry — plugins are pure execution engines with no knowledge of test logic.

## Tech Stack

| Concern | Library |
|---------|---------|
| Test framework | Cucumber (BDD) |
| Language | TypeScript |
| Web automation | Playwright |
| Mobile automation | WebDriverIO + Appium (UiAutomator2 / XCUITest) |
| Performance | @gatling.io/core + @gatling.io/http |
| Communication | gRPC (@grpc/grpc-js) |
| Logging | Pino |
| Containerization | Docker + Docker Compose |
| Package manager | pnpm |
