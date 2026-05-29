# Why the API plugin doesn't use Playwright's API testing

**Question:** Playwright ships its own API testing surface (`APIRequestContext` / the
`request` fixture). Why does this framework have a separate `api` plugin built on a
hand-rolled `fetch` client instead of reusing it?

**Status:** Deliberate. As of this writing there is zero usage of `APIRequestContext`
or `request.*` anywhere in the repo — the `api` plugin is fully self-contained on the
Fetch API (`src/plugins/api/http/http.client.ts`).

---

## TL;DR

API testing and UI testing are **separate plugins behind the same intent protocol**.
Reusing Playwright's `request` would couple the API/state-injection path to the
Playwright runtime, which defeats the point of the microkernel split and bloats the
modes (and CI jobs) that don't need a browser framework at all.

## The reasons

### 1. Process independence — the core of the microkernel design
Every capability is an independent gRPC plugin that speaks the same intent protocol to
the chaos-proxy kernel. Playwright's `APIRequestContext` lives *inside* the Playwright
runtime. Using it would make the API path depend on the Playwright plugin being alive.
Today `src/plugins/api/server.ts` boots on its own, with no Playwright in memory.

With `DRIVER=api`, UI molecules self-skip and only DAO / API state injection runs — so
the UI runtime is intentionally absent in that mode.

### 2. Weight and CI footprint
Playwright's `request` doesn't need browser binaries, but it still pulls in the full
`playwright` package and runtime. A `fetch`-based client is the minimal dependency, so
the API job can run in a plain Node container instead of
`mcr.microsoft.com/playwright:<ver>-jammy`.

### 3. The `api` plugin is not only "API testing" — it's also state injection (DAO)
UI flows (`DRIVER=playwright`) call the API plugin to seed state. If that client were
Playwright's `request`, the setup/DAO path would depend on the same framework that is
driving the UI. Keeping them separate lets *any* driver ask the API plugin for setup.

### 4. Testability of the framework itself (it's "Test-Oriented")
`HttpClient` accepts an injectable `transport` / `fetchImpl`
(`src/plugins/api/http/http.client.ts:25-33`), so the framework's own HTTP client is
unit-testable without network. Playwright's `APIRequestContext` is far harder to mock
or inject.

### 5. Contract-driven, not request-driven
The real abstraction isn't "do a GET" — it's `EXECUTE_CONTRACT_ENDPOINT`
(`src/plugins/api/actions/ExecuteContractEndpoint.ts`): load an `ApiContract`, render
its templates with variables, validate the expected status (single or array), and emit
contract telemetry with request hashes. That layer is framework-specific; Playwright
doesn't provide it.

## The trade-off we're accepting

Playwright's `request` shares `storageState` / cookies with the `BrowserContext` and
integrates with the trace viewer. If we ever need a **mixed** test that reuses the
browser's authenticated session to hit an API directly, that integration would be a
genuine advantage of Playwright's approach.

For the general case — pure, headless API checks with contracts and telemetry — the
self-contained client wins on isolation, weight, and testability. Revisit this decision
only if the browser-session-reuse use case becomes common.

## Related

- `src/plugins/api/http/http.client.ts` — the fetch-based client (injectable transport)
- `src/plugins/api/actions/ExecuteContractEndpoint.ts` — contract-driven execution
- `src/plugins/api/api.ts` — plugin entry / client caching
- `CLAUDE.md` → "`DRIVER` env routes UI intents"
