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

| AHM Layer | Clean Code Equivalent | Folder | Purpose |
|-----------|----------------------|--------|---------|
| Atoms | -- | `kernel/client.ts` | `sendIntent()` -- indivisible primitives |
| Molecules | Actions | `[domain]/actions/` | Grouped atomic intents (cross-platform) |
| Organisms | Use Cases | `[domain]/usecases/` | Orchestrate actions into business flows |
| Eco-Systems | Scenarios | `[domain]/features/` + `step_definitions/` | BDD scenarios composing use cases + DAOs |

## Project Structure

```
src/
  proto/                   # gRPC service definitions (ptom.proto)
  kernel/                  # Microkernel: proxy, client, locator resolver, plugin factory
  plugins/                 # Isolated gRPC plugin servers
    playwright/            #   Web automation (Chromium)
    appium/                #   Mobile automation (Android/iOS)
    gatling/               #   Performance testing (@gatling.io TS DSL)
    api/                   #   API testing (HttpClient)
  core/
    test-data/             # Data sources (users.json)
    tests/
      [domain]/            # e.g., 'checkout'
        actions/           # Molecules: reusable business action wrappers
        usecases/          # Organisms: business flow orchestration
        features/          # Eco-Systems: BDD scenarios (.feature)
        step_definitions/  # Thin bindings (Gherkin -> use cases + DAOs)
        locators/          # JSON mapping logical keys to platform selectors
        dao/               # API state injection (S0)
  utils/                   # Shared utilities (pino logger)
  telemetry/               # Observability and metrics
```

## Prerequisites

- Node.js 20.19.x (see `.nvmrc`)
- pnpm 10.29.x

## Setup

```bash
pnpm install
```

## Running Tests

Start the microkernel and the required plugin, then run Cucumber:

```bash
# Terminal 1: Start the proxy
pnpm proxy

# Terminal 2: Start the plugin for your target platform
pnpm plugin:playwright   # Web
pnpm plugin:appium       # Mobile
pnpm plugin:api          # API
pnpm plugin:gatling      # Performance

# Terminal 3: Run tests
pnpm test
```

### With Docker

```bash
# Web testing (default)
docker compose up

# Mobile testing
docker compose --profile mobile up

# Performance testing
docker compose --profile performance up
```

## Environment Configuration

The `.env` file controls the execution matrix:

| Variable | Options | Description |
|----------|---------|-------------|
| `PLATFORM` | `web`, `android`, `ios`, `api` | Target platform |
| `VIEWPORT` | `desktop`, `responsive` | Web viewport (only when `PLATFORM=web`) |
| `DRIVER` | `playwright`, `appium`, `api` | Automation driver |
| `BASE_URL` | URL | Web application under test |
| `API_BASE_URL` | URL | Backend API for state injection |
| `COUNTRY_CODE` | `US`, `MX`, `CH`, `JP` | Market context |
| `HEADLESS` | `true`, `false` | Browser visibility |

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

Actions always use logical keys (`streetInput`), never raw selectors. The same test code runs across all platforms.

## Key Concepts

### Chaos Suppression
The proxy detects transient failures (stale elements, timeouts, detached nodes) and automatically retries with exponential backoff. Deterministic failures fail immediately.

### API State Injection
DAOs bypass flaky UI setup by injecting test state directly via API calls. Login, cart creation, and market selection happen through `HttpClient`, then UI tests attach to the pre-built state.

### Plugin Isolation
Each plugin runs as an independent gRPC server. Plugins are stateless from the proxy's perspective -- the proxy resolves locators and handles retries before forwarding.

## Documentation

| Document | Description |
|----------|-------------|
| `docs/atomic_design_testing.md` | Atomic Design layer mapping and conventions |
| `docs/tom_plugin_implementation_plan.md` | TOM plugin architecture roadmap |
| `docs/locator-schema-prompt.md` | Prompt for generating locator JSON artifacts |

## Tech Stack

- **Test Framework**: Cucumber (BDD)
- **Language**: TypeScript
- **Web Automation**: Playwright
- **Mobile Automation**: WebDriverIO + Appium (UiAutomator2 / XCUITest)
- **Performance**: Gatling (@gatling.io/core + @gatling.io/http)
- **Communication**: gRPC (@grpc/grpc-js)
- **Logging**: Pino
- **Containerization**: Docker + Docker Compose
